import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';
import {
  createGraphCase,
  createGraphModels,
  createGraphTables,
  dropGraphTables,
  dumpGraphTables,
  findKeptGraphRows,
  seedGraphTables,
} from '../../../testUtils/graphCases.js';

// The errors that generated graphs may cause, as they're random, and the cases
// that allow them:
const expectedErrors = [
  { type: 'InvalidGraph', when: ({ isConflicting }) => isConflicting },
  // 3.x fails on these graphs too:
  { message: /points to a model that the graph doesn't write before it/ },
  { message: /the object graph contains cyclic references/ },
  {
    name: 'NotFoundError',
    when: ({ options }) => options.relate !== true || options.insertMissing !== true,
  },
  {
    message: /cannot relate HasManyRelation or HasOneRelation using insertGraph/,
    when: ({ method }) => method === 'insertGraph',
  },
  // Options that keep rows or insert rows with their ids can make the graph
  // collide with unique keys:
  {
    name: 'UniqueViolationError',
    when: ({ options }) => options.insertMissing || options.noDelete || options.noUnrelate,
  },
  // TODO: Remove once #398 is fixed: The row of a HasOneRelation slot that
  // only moves out in a later pass collides with the new row of the slot.
  { name: 'UniqueViolationError', message: /graph_gen_profile/ },
  // SQL Server doesn't take the ids that `insertMissing` inserts in identity
  // columns:
  {
    message: /IDENTITY_INSERT is set to OFF|not allowed as explicit identity values/,
    when: ({ options }) => options.insertMissing,
  },
];

// Write generated graphs, and check what has to hold for any graph: A failed
// write leaves the rows as they were, the rows that the graph keeps or inserts
// aren't deleted, no query runs after the write, and writing the same graph
// again gives the same rows. Set OBJECTION_TEST_GRAPH_CASES for more cases.
export default (session) => {
  describe('upsertGraph() and insertGraph() of generated graphs', () => {
    const { knex } = session;
    const caseCount = Number(process.env.OBJECTION_TEST_GRAPH_CASES || 100);
    const { Person } = createGraphModels(Model);

    beforeAll(() => createGraphTables(knex));
    afterAll(() => dropGraphTables(knex));

    const write = async (testCase) => {
      await seedGraphTables(knex, testCase.rows);
      const seededRows = await dumpGraphTables(knex);
      const lateQueries = [];
      let isWritten = false;
      let error = null;

      const onQuery = (query) => {
        if (isWritten) {
          lateQueries.push(query.sql);
        }
      };

      knex.on('query', onQuery);

      try {
        await knex.transaction((trx) =>
          Person.query(trx)[testCase.method](structuredClone(testCase.graph), {
            ...testCase.options,
          }),
        );
      } catch (err) {
        error = err;
      }

      isWritten = true;
      // Give queries that are still running the time to start:
      await new Promise((resolve) => setTimeout(resolve, 10));
      knex.removeListener('query', onQuery);

      return { error, lateQueries, seededRows, rows: await dumpGraphTables(knex) };
    };

    for (let seed = 1; seed <= caseCount; seed++) {
      it(`should write generated graph ${seed}`, async () => {
        const testCase = createGraphCase(seed);
        const context = `graph ${seed}: ${JSON.stringify(testCase)}`;

        const result = await write(testCase);
        const { error, rows } = result;

        expect(result.lateQueries, context).toEqual([]);
        // Graphs built to conflict have to be rejected as such. `insertGraph()`
        // rejects relates into HasMany relations before it compares places:
        if (testCase.isConflicting) {
          const isRejected =
            error?.type === 'InvalidGraph' ||
            (testCase.method === 'insertGraph' &&
              /cannot relate HasManyRelation/.test(error?.message));
          expect(isRejected, `${error?.message}, ${context}`).toBe(true);
        }

        if (error) {
          const isExpected = expectedErrors.some(
            ({ name, type, message, when }) =>
              (!name || error.name === name) &&
              (!type || error.type === type) &&
              (!message || message.test(error.message)) &&
              (!when || when(testCase)),
          );
          expect(isExpected, `${error.name}: ${error.message}, ${context}`).toBe(true);
          expect(rows, context).toEqual(result.seededRows);
        } else if (testCase.method === 'upsertGraph') {
          // These options ignore places of rows, which may then be removed from
          // the places that the graph leaves them out of:
          const { noRelate, noInsert, insertMissing } = testCase.options;

          if (!noRelate && !noInsert && !insertMissing) {
            const deletedRows = findKeptGraphRows(testCase).filter(([table, label]) =>
              rows[table].every((row) => JSON.parse(row).label !== label),
            );
            expect(deletedRows, context).toEqual([]);
          }

          for (const [table, label, values] of testCase.expectedValues) {
            const row = rows[table]
              .map((row) => JSON.parse(row))
              .find((row) => row.label === label);
            expect(row, context).toMatchObject(values);
          }
        }

        // Of parallel writes that fail, either may throw first:
        const again = await write(testCase);
        expect(again.error?.name, context).toBe(error?.name);
        expect(again.rows, context).toEqual(rows);
      });
    }
  });
};
