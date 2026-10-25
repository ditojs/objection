import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundError } from 'objection';
import { FetchStrategy } from '../../lib/queryBuilder/graph/GraphOptions.js';

export default (session) => {
  const Model1 = session.unboundModels.Model1;

  describe('upsertGraph (strict)', () => {
    describe('relation names', () => {
      beforeEach(() => {
        return session.populate([{ id: 1, model1Prop1: 'root 1' }]);
      });

      it('should throw for a relation that the model does not have', async () => {
        for (const key of ['model1Relation9', 'model1Relation2.model2Relation9']) {
          const relationName = key.split('.').pop();
          const error = await Model1.query(session.knex)
            .upsertGraph({ id: 1 }, { strict: true, relations: { [key]: { removed: 'preserve' } } })
            .catch((err) => err);

          expect(error.type).toBe('InvalidGraph');
          expect(error.message).toContain(`"${relationName}"`);
          expect(error.message).toContain(`"${key}"`);
        }
      });

      it('should throw for insertGraph() too', async () => {
        const error = await Model1.query(session.knex)
          .insertGraph(
            { model1Prop1: 'new' },
            { strict: true, relations: { model1Relation9: { added: 'relate' } } },
          )
          .catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain('"model1Relation9"');
      });

      it('should accept * and ^, and relations that the graph does not give', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 1 },
          {
            strict: true,
            relations: {
              '*': { removed: 'preserve' },
              'model1Relation1.^': { removed: 'preserve' },
              'model1Relation2.model2Relation1.*': { kept: 'update' },
            },
          },
        );
      });
    });

    describe('the same results as the old options', () => {
      async function upsert(graph, options) {
        await session.populate([
          { id: 1, model1Prop1: 'root 1', model1Prop2: 1 },
          {
            id: 2,
            model1Prop1: 'root 2',
            model1Prop2: 2,
            model1Relation1: { id: 3, model1Prop1: 'belongsToOne', model1Prop2: 3 },
            model1Relation2: [
              { idCol: 1, model2Prop1: 'hasMany 1' },
              { idCol: 2, model2Prop1: 'hasMany 2' },
            ],
            model1Relation3: [{ idCol: 3, model2Prop1: 'manyToMany 1' }],
          },
        ]);

        try {
          await Model1.query(session.knex).upsertGraph(graph, options);
        } catch (err) {
          return { error: err.message };
        }

        return {
          model1: await session.knex('Model1').orderBy('id'),
          model2: await session.knex('model2').orderBy('id_col'),
          model1Model2: await session
            .knex('Model1Model2')
            .select('model1Id', 'model2Id')
            .orderBy(['model1Id', 'model2Id']),
        };
      }

      for (const [description, graph, oldOptions, relations] of [
        [
          'unrelate',
          { id: 2, model1Relation2: [{ idCol: 1 }] },
          { unrelate: 'model1Relation2' },
          { model1Relation2: { removed: 'unrelate' } },
        ],
        [
          'noDelete',
          { id: 2, model1Relation2: [{ idCol: 1 }] },
          { noDelete: 'model1Relation2' },
          { model1Relation2: { removed: 'preserve' } },
        ],
        [
          'relate',
          { id: 1, model1Relation3: [{ idCol: 3 }, { idCol: 1 }] },
          { relate: 'model1Relation3' },
          { model1Relation3: { added: 'relate' } },
        ],
        [
          'update',
          { id: 2, model1Relation1: { id: 3, model1Prop1: 'updated' } },
          { update: 'model1Relation1' },
          { model1Relation1: { kept: 'update' } },
        ],
      ]) {
        it(`should write the same rows with ${description}`, async () => {
          // `update()` sets the defaults of the props that a graph leaves out,
          // where `patch()` keeps their values:
          Model1.$$jsonSchema = {
            type: 'object',
            properties: { model1Prop2: { type: 'integer', default: 99 } },
          };

          try {
            const expected = await upsert(graph, oldOptions);
            const result = await upsert(graph, { strict: true, relations });
            const defaultResult = await upsert(graph, {});

            expect(expected.error).toBeUndefined();
            expect(result).toEqual(expected);
            // The options make a difference for these graphs:
            expect(defaultResult).not.toEqual(expected);
          } finally {
            delete Model1.$$jsonSchema;
            delete Model1.$$validator;
          }
        });
      }
    });

    describe('writes', () => {
      beforeEach(() => {
        return session.populate([
          { id: 1, model1Prop1: 'root 1' },
          {
            id: 2,
            model1Prop1: 'root 2',
            // A chain of BelongsToOneRelations:
            model1Relation1: {
              id: 3,
              model1Prop1: 'belongsToOne',
              model1Relation1: { id: 4, model1Prop1: 'belongsToOne 2' },
            },
            model1Relation2: [
              { idCol: 1, model2Prop1: 'hasMany 1' },
              { idCol: 2, model2Prop1: 'hasMany 2' },
            ],
          },
        ]);
      });

      const getRows = async (table, idColumn) =>
        (await session.knex(table).orderBy(idColumn)).map((row) => row[idColumn]);
      const getModel1 = (id) => session.knex('Model1').where('id', id).first();

      it('should relate existing rows and insert missing ones with relateOrInsert', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 1, model1Relation3: [{ idCol: 1 }, { idCol: 100, model2Prop1: 'new' }] },
          { strict: true, relations: { model1Relation3: { added: 'relateOrInsert' } } },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2, 100]);
        const joinRows = await session.knex('Model1Model2').orderBy('model2Id');
        expect(joinRows.map((row) => [row.model1Id, row.model2Id])).toEqual([
          [1, 1],
          [1, 100],
        ]);
      });

      it('should let a later entry override a setting of *', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 2, model1Relation1: null, model1Relation2: [{ idCol: 1 }] },
          {
            strict: true,
            relations: { '*': { removed: 'preserve' }, model1Relation2: { removed: 'delete' } },
          },
        );

        expect((await getModel1(2)).model1Id).toBe(3);
        expect(await getRows('model2', 'id_col')).toEqual([1]);
      });

      it('should let a later * override a setting of an earlier entry', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 2, model1Relation2: [{ idCol: 1 }] },
          {
            strict: true,
            relations: { model1Relation2: { removed: 'delete' }, '*': { removed: 'preserve' } },
          },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2]);
      });

      it('should apply a recursive key at every level', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 2, model1Relation1: { id: 3, model1Relation1: null } },
          { strict: true, relations: { 'model1Relation1.^': { removed: 'unrelate' } } },
        );

        expect((await getModel1(3)).model1Id).toBe(null);
        expect(await getRows('Model1', 'id')).toEqual([1, 2, 3, 4]);
      });

      it('should not write the root with root: { kept: preserve }', async () => {
        const upsert = (model1Prop1) =>
          Model1.query(session.knex).upsertGraph(
            { id: 1, model1Prop1, model1Relation3: [{ model2Prop1: 'new' }] },
            { strict: true, root: { kept: 'preserve' } },
          );

        const error = await upsert('changed').catch((err) => err);
        expect(error.type).toBe('InvalidGraph');
        expect(await getRows('model2', 'id_col')).toHaveLength(2);

        await upsert('root 1');
        expect((await getModel1(1)).model1Prop1).toBe('root 1');
        expect(await getRows('model2', 'id_col')).toHaveLength(3);
      });

      it('should insert a missing root with root: { added: insert }', async () => {
        const graph = { id: 50, model1Prop1: 'new root' };
        const error = await Model1.query(session.knex)
          .upsertGraph(graph, { strict: true })
          .catch((err) => err);

        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.message).toContain('root model (id=50) does not exist');
        expect(error.message).toContain("set root: { added: 'insert' }");

        const nonStrictError = await Model1.query(session.knex)
          .upsertGraph(graph)
          .catch((err) => err);
        expect(nonStrictError.message).toBe(
          'root model (id=50) does not exist. If you want to insert it with an id, use the insertMissing option',
        );

        await Model1.query(session.knex).upsertGraph(graph, {
          strict: true,
          root: { added: 'insert' },
        });

        expect((await getModel1(50)).model1Prop1).toBe('new root');
      });

      it('should throw for rows without ids with created: throw, before writing', async () => {
        const error = await Model1.query(session.knex)
          .upsertGraph(
            { id: 1, model1Prop1: 'changed', model1Relation2: [{ model2Prop1: 'new' }] },
            { strict: true, relations: { model1Relation2: { created: 'throw' } } },
          )
          .catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Relation2[0]'");
        expect(error.message).toContain("created: 'throw'");
        expect((await getModel1(1)).model1Prop1).toBe('root 1');
        expect(await getRows('model2', 'id_col')).toEqual([1, 2]);
      });

      it('should throw for root rows without ids with root: { created: throw }', async () => {
        const error = await Model1.query(session.knex)
          .upsertGraph([{ id: 1 }, { model1Prop1: 'new' }], {
            strict: true,
            root: { created: 'throw' },
          })
          .catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'[1]'");
        expect(await getRows('Model1', 'id')).toEqual([1, 2, 3, 4]);
      });

      it('should throw for rows without ids in insertGraph() with created: throw', async () => {
        const error = await Model1.query(session.knex)
          .insertGraph(
            { model1Prop1: 'new', model1Relation2: [{ model2Prop1: 'new' }] },
            { strict: true, relations: { model1Relation2: { created: 'throw' } } },
          )
          .catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Relation2[0]'");
        expect(await getRows('Model1', 'id')).toEqual([1, 2, 3, 4]);
      });

      it('should insert rows with ids with added: insert and created: throw', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 1, model1Relation2: [{ idCol: 100, model2Prop1: 'new' }] },
          { strict: true, relations: { model1Relation2: { added: 'insert', created: 'throw' } } },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2, 100]);
      });

      it('should name the added settings for rows with ids that the graph cannot write', async () => {
        const upsert = (graph, relations) =>
          Model1.query(session.knex)
            .upsertGraph(graph, { strict: true, relations })
            .catch((err) => err);

        const graph = { id: 1, model1Relation3: [{ idCol: 1 }] };
        const nonStrictError = await Model1.query(session.knex)
          .upsertGraph(graph)
          .catch((err) => err);
        expect(nonStrictError.message).toBe(
          'model (id=1) is not a child of model (id=1). If you want to relate it, use the relate option. If you want to insert it with an id, use the insertMissing option',
        );

        const unrelatedError = await upsert(graph);
        expect(unrelatedError).toBeInstanceOf(NotFoundError);
        expect(unrelatedError.message).toContain(
          "set added: 'relate' for model1Relation3 in the relations option",
        );
        expect(unrelatedError.message).toContain("set added: 'insert' for model1Relation3");

        const missingError = await upsert(
          { id: 1, model1Relation3: [{ idCol: 100 }] },
          { model1Relation3: { added: 'relate' } },
        );
        expect(missingError).toBeInstanceOf(NotFoundError);
        expect(missingError.message).toContain(
          "set added: 'relateOrInsert' for model1Relation3 in the relations option",
        );
      });

      it('should relate rows with #ref and #dbRef without added, also with created: throw', async () => {
        await Model1.query(session.knex).upsertGraph(
          [
            { id: 1, model1Relation2: [{ '#id': 'new', model2Prop1: 'new' }] },
            { id: 2, model1Relation3: [{ '#ref': 'new' }, { '#dbRef': 1 }] },
          ],
          { strict: true, allowRefs: true, relations: { model1Relation3: { created: 'throw' } } },
        );

        const [, , newId] = await getRows('model2', 'id_col');
        const joinRows = await session.knex('Model1Model2').orderBy(['model1Id', 'model2Id']);
        expect(joinRows.map((row) => [row.model1Id, row.model2Id])).toEqual([
          [2, 1],
          [2, newId],
        ]);
      });

      it('should relate rows in insertGraph() with added: relate', async () => {
        const inserted = await Model1.query(session.knex).insertGraph(
          { model1Prop1: 'new', model1Relation3: [{ idCol: 1 }] },
          { strict: true, relations: { model1Relation3: { added: 'relate' } } },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2]);
        const joinRows = await session.knex('Model1Model2');
        expect(joinRows.map((row) => [row.model1Id, row.model2Id])).toEqual([[inserted.id, 1]]);
      });

      it('should insert rows with ids in insertGraph() by default', async () => {
        await Model1.query(session.knex).insertGraph(
          { model1Prop1: 'new', model1Relation3: [{ idCol: 100, model2Prop1: 'new' }] },
          { strict: true },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2, 100]);
      });
    });

    describe('key props', () => {
      beforeEach(() => {
        return session.populate([
          { id: 1, model1Prop1: 'root 1', model1Relation2: [{ idCol: 1 }] },
          { id: 2, model1Prop1: 'root 2' },
        ]);
      });

      const upsert = (graph, options) => Model1.query(session.knex).upsertGraph(graph, options);
      const getModel2 = (idCol) => session.knex('model2').where('id_col', idCol).first();

      it('should throw for a foreign key that contradicts its HasManyRelation', async () => {
        const error = await upsert(
          { id: 1, model1Relation2: [{ idCol: 1, model1Id: 2 }] },
          { strict: true },
        ).catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Relation2[0].model1Id'");
        expect(error.message).toContain("'model1Relation2[0]'");
        expect((await getModel2(1)).model1_id).toBe(1);

        // The relation overrides the prop without strict mode:
        await upsert({ id: 1, model1Relation2: [{ idCol: 1, model1Id: 2, model2Prop1: 'x' }] });
        const row = await getModel2(1);
        expect([row.model1_id, row.model2_prop1]).toEqual([1, 'x']);
      });

      it('should accept a foreign key that equals its relation', async () => {
        for (const model1Id of [1, '1']) {
          await upsert(
            { id: 1, model1Relation2: [{ idCol: 1, model1Id, model2Prop1: `${model1Id}` }] },
            { strict: true },
          );
          expect((await getModel2(1)).model2_prop1).toBe(`${model1Id}`);
        }
      });

      it('should throw for a foreign key that contradicts its BelongsToOneRelation', async () => {
        const options = { strict: true, relations: { model1Relation1: { added: 'relate' } } };
        const error = await upsert(
          { id: 1, model1Id: 3, model1Relation1: { id: 2 } },
          options,
        ).catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Id'");
        expect(error.message).toContain("'model1Relation1'");

        await upsert({ id: 1, model1Id: 2, model1Relation1: { id: 2 } }, options);
        const row = await session.knex('Model1').where('id', 1).first();
        expect(row.model1Id).toBe(2);
      });

      it('should throw for a foreign key that contradicts a cleared BelongsToOneRelation', async () => {
        const error = await upsert(
          { id: 1, model1Id: 2, model1Relation1: null },
          { strict: true },
        ).catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Id'");
        expect(error.message).toContain("'model1Relation1'");

        await upsert({ id: 1, model1Id: null, model1Relation1: null }, { strict: true });
      });

      it('should throw for a foreign key below a new model', async () => {
        const error = await upsert(
          { model1Prop1: 'new', model1Relation2: [{ model2Prop1: 'new', model1Id: 1 }] },
          { strict: true },
        ).catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Relation2[0].model1Id'");
        expect(await session.knex('Model1').orderBy('id').pluck('id')).toEqual([1, 2]);
      });

      it('should accept the extras of join rows', async () => {
        await upsert(
          { id: 1, model1Relation3: [{ idCol: 1, extra1: 'extra' }] },
          { strict: true, relations: { model1Relation3: { added: 'relate' } } },
        );

        const joinRow = await session.knex('Model1Model2').first();
        expect(joinRow.extra1).toBe('extra');
      });
    });

    describe('preserved values', () => {
      beforeEach(() => {
        return session.populate([
          {
            id: 1,
            model1Prop1: 'root 1',
            model1Prop2: 10,
            model1Relation1: { id: 2, model1Prop1: 'belongsToOne' },
            model1Relation2: [{ idCol: 1, model2Prop1: 'hasMany', model2Prop2: 1 }],
            model1Relation3: [
              {
                idCol: 2,
                model2Prop1: 'manyToMany',
                extra1: 'extra',
                model2Relation3: [
                  { id: 1, model3Prop1: 'json', model3JsonProp: { a: [1, { b: true }], c: null } },
                ],
              },
            ],
          },
          { id: 3, model1Prop1: 'root 3' },
        ]);
      });

      const upsert = (graph, options) =>
        Model1.query(session.knex)
          .upsertGraph(graph, { strict: true, ...options })
          .catch((err) => err);
      const getTables = async () => {
        const tables = {};
        for (const [table, idColumn] of [
          ['Model1', 'id'],
          ['model2', 'id_col'],
          ['model3', 'id'],
          ['Model1Model2', 'id'],
          ['Model2Model3ManyToMany', 'model2Id'],
        ]) {
          tables[table] = await session.knex(table).orderBy(idColumn);
        }
        return tables;
      };

      it('should throw for values that kept: preserve does not write and that differ', async () => {
        const graph = (model2Prop1) => ({
          id: 1,
          model1Relation2: [{ idCol: 1, model2Prop1 }],
        });
        const options = { relations: { model1Relation2: { kept: 'preserve' } } };

        for (const fetchStrategy of Object.keys(FetchStrategy)) {
          const error = await upsert(graph('changed'), { ...options, fetchStrategy });
          expect(error.type).toBe('InvalidGraph');
          expect(error.message).toContain("'model1Relation2[0]'");
          expect(error.message).toContain('model2Prop1');
          expect(error.message).toContain('"changed"');
          expect(error.message).toContain('"hasMany"');
        }

        const tables = await getTables();
        const queries = [];
        const onQuery = ({ sql }) => queries.push(sql);
        session.knex.on('query', onQuery);
        const result = await upsert(graph('hasMany'), options);
        session.knex.off('query', onQuery);

        expect(result).not.toBeInstanceOf(Error);
        expect(queries.filter((sql) => /^(insert|update|delete)/i.test(sql))).toEqual([]);
        expect(await getTables()).toEqual(tables);
      });

      it('should not compare #ref{} templates', async () => {
        const result = await upsert(
          [
            { '#id': 'row', id: 3, model1Prop1: 'root 3' },
            { id: 1, model1Prop1: '#ref{row.model1Prop1}' },
          ],
          { allowRefs: true, root: { kept: 'preserve' } },
        );

        expect(result).not.toBeInstanceOf(Error);
        expect((await session.knex('Model1').where('id', 1).first()).model1Prop1).toBe('root 1');
      });

      it('should name values that JSON cannot represent', async () => {
        const options = { root: { kept: 'preserve' } };
        const error = await upsert({ id: 1, model1Prop2: 11n }, options);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain('the value 11,');
        expect(error.message).toContain('the stored value 10');
        expect(await upsert({ id: 1, model1Prop2: 10n }, options)).not.toBeInstanceOf(Error);
      });

      it('should not compare props that are not columns', async () => {
        class LabeledModel1 extends Model1 {
          $formatDatabaseJson(json) {
            json = super.$formatDatabaseJson(json);
            delete json.label;
            return json;
          }
        }

        const result = await LabeledModel1.query(session.knex)
          .upsertGraph({ id: 1, label: 'x' }, { strict: true, root: { kept: 'preserve' } })
          .catch((err) => err);

        expect(result).not.toBeInstanceOf(Error);
      });

      it('should not compare values at #ref places that their model writes', async () => {
        const result = await upsert(
          [
            { '#id': 'row', id: 2, model1Prop1: 'new' },
            { id: 1, model1Relation1: { '#ref': 'row', model1Prop1: 'new' } },
          ],
          { allowRefs: true },
        );

        expect(result).not.toBeInstanceOf(Error);
        expect((await session.knex('Model1').where('id', 2).first()).model1Prop1).toBe('new');
      });

      it('should not compare the values of removed rows', async () => {
        const result = await upsert(
          { id: 1, model1Relation2: [{ idCol: 1, model2Prop1: 'stale', '#delete': true }] },
          { allowMarkers: true, relations: { model1Relation2: { kept: 'preserve' } } },
        );

        expect(result).not.toBeInstanceOf(Error);
        expect(await session.knex('model2').where('id_col', 1)).toEqual([]);
      });

      it('should compare the rows that added: relate relates under kept: preserve', async () => {
        const error = await upsert(
          {
            id: 3,
            model1Relation3: [{ idCol: 2, model2Prop1: 'changed', model2Relation3: [{ id: 1 }] }],
          },
          { relations: { '*': { added: 'relate', kept: 'preserve', removed: 'preserve' } } },
        );

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'model1Relation3[0]'");
        expect(await session.knex('Model1Model2').where('model1Id', 3)).toEqual([]);
      });

      it('should accept the keys that relations set under kept: preserve', async () => {
        const result = await upsert(
          { id: 3, model1Id: 2, model1Relation1: { id: 2 } },
          { root: { kept: 'preserve' }, relations: { model1Relation1: { added: 'relate' } } },
        );

        expect(result).not.toBeInstanceOf(Error);
        expect((await session.knex('Model1').where('id', 3).first()).model1Id).toBe(2);
      });

      for (const fetchStrategy of Object.keys(FetchStrategy)) {
        it(`should send a fetched graph back unchanged (fetchStrategy: ${fetchStrategy})`, async () => {
          const graph = await Model1.query(session.knex)
            .findById(1)
            .withGraphFetched(
              '[model1Relation1, model1Relation2, model1Relation3.model2Relation3]',
            );
          const tables = await getTables();

          const result = await upsert(graph, {
            fetchStrategy,
            root: { kept: 'preserve' },
            relations: { '*': { kept: 'preserve', added: 'relate', removed: 'preserve' } },
          });

          expect(result).not.toBeInstanceOf(Error);
          expect(await getTables()).toEqual(tables);
        });
      }

      it('should throw for values at #ref places of BelongsToOneRelations that differ', async () => {
        const graph = (model1Id) => [
          { '#id': 'row', id: 2, model1Prop1: 'belongsToOne' },
          { id: 1, model1Relation1: { '#ref': 'row', model1Id } },
        ];

        const error = await upsert(graph(3), { allowRefs: true });
        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'[1].model1Relation1'");
        expect(error.message).toContain('model1Id');

        const result = await upsert(graph(null), { allowRefs: true });
        expect(result).not.toBeInstanceOf(Error);

        // A `#ref` place writes the row where its model doesn't:
        await upsert(
          [
            { '#id': 'row', id: 2 },
            { id: 1, model1Relation1: { '#ref': 'row', model1Prop1: 'changed' } },
          ],
          { allowRefs: true, root: { kept: 'preserve' } },
        );
        expect((await session.knex('Model1').where('id', 2).first()).model1Prop1).toBe('changed');
      });

      it('should throw for values at #ref places of many-to-many relations that differ', async () => {
        const graph = (model2Prop1) => [
          { id: 3, model1Relation3: [{ '#id': 'row', idCol: 2 }] },
          { id: 1, model1Relation3: [{ '#ref': 'row', model2Prop1, extra1: 'changed' }] },
        ];
        const options = { allowRefs: true, relations: { model1Relation3: { added: 'relate' } } };

        const error = await upsert(graph('changed'), options);
        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain("'[1].model1Relation3[0]'");
        expect(error.message).toContain('model2Prop1');

        const result = await upsert(graph('manyToMany'), options);
        expect(result).not.toBeInstanceOf(Error);
        const joinRow = await session.knex('Model1Model2').where('model1Id', 1).first();
        expect(joinRow.extra1).toBe('changed');
      });
    });
  });
};
