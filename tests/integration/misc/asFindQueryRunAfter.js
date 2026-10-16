import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('asFindQuery() in static hooks ignores runAfter() of the original query #2093', () => {
    const { knex } = session;
    let Person;
    let hookResults;

    beforeAll(async () => {
      await knex.schema.dropTableIfExists('as_find_query_person');
      await session.createTable('as_find_query_person', (table, { increments }) => {
        increments('id');
        table.string('name');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('as_find_query_person');
    });

    beforeAll(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'as_find_query_person';
        }

        static async beforeUpdate({ asFindQuery }) {
          hookResults.push(await asFindQuery().select('id'));
        }

        static async beforeDelete({ asFindQuery }) {
          try {
            hookResults.push(await asFindQuery().select('id'));
          } catch (err) {
            hookResults.push(err);
          }
        }
      };

      Person.knex(knex);
    });

    beforeEach(async () => {
      await knex('as_find_query_person').delete();
      await knex('as_find_query_person').insert([
        { id: 1, name: 'Jennifer' },
        { id: 2, name: 'Brad' },
      ]);
      hookResults = [];
    });

    it('should not run runAfter() callbacks of the original query', async () => {
      let calls = 0;

      const result = await Person.query()
        .patch({ name: 'Updated' })
        .where('id', 1)
        .runAfter((result) => {
          calls++;
          return result;
        });

      expect(result).toBe(1);
      expect(calls).toBe(1);
      expect(hookResults).toHaveLength(1);
      expect(hookResults[0].map((it) => it.id)).toEqual([1]);
    });

    it('should not throw because of throwIfNotFound() on the original query', async () => {
      let error;

      try {
        await Person.query().deleteById(1000).throwIfNotFound();
      } catch (err) {
        error = err;
      }

      // The delete itself throws, but the hook's find query just returns no rows.
      expect(error).toBeInstanceOf(Person.NotFoundError);
      expect(hookResults).toEqual([[]]);
    });

    it('should return an empty array for a findById() query that finds nothing', async () => {
      const result = await Person.query().deleteById(1000);

      expect(result).toBe(0);
      expect(hookResults).toEqual([[]]);
    });

    // MySQL doesn't support `returning()`, so there are no models to traverse.
    it.skipIf(session.isMySql())('should not traverse the results of the find query', async () => {
      const traversed = [];

      await Person.query()
        .patch({ name: 'Updated' })
        .where('id', 2)
        .returning('*')
        .traverse((model) => traversed.push(model.id));

      // Only the patched rows are traversed, not the rows of the hook's find query.
      expect(traversed).toEqual([2]);
      expect(hookResults[0].map((it) => it.id)).toEqual([2]);
    });

    it('should still run runAfter() callbacks added to the find query itself', async () => {
      const { beforeUpdate } = Person;

      Person.beforeUpdate = async ({ asFindQuery }) => {
        hookResults.push(await asFindQuery().runAfter((rows) => rows.map((it) => it.name)));
      };

      try {
        await Person.query().patch({ name: 'Updated' }).where('id', 1);
      } finally {
        Person.beforeUpdate = beforeUpdate;
      }

      expect(hookResults).toEqual([['Jennifer']]);
    });
  });

  describe('asFindQuery() in static hooks resolves to an array, unwrapped by first()', () => {
    const { knex } = session;
    let Person;
    let hookResults;

    beforeAll(async () => {
      await knex.schema.dropTableIfExists('as_find_query_owner');
      await session.createTable('as_find_query_owner', (table, { increments }) => {
        increments('id');
        table.string('name');
        table.integer('parentId');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('as_find_query_owner');
    });

    beforeAll(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'as_find_query_owner';
        }

        static get relationMappings() {
          return {
            child: {
              relation: Model.HasOneRelation,
              modelClass: Person,
              join: {
                from: 'as_find_query_owner.id',
                to: 'as_find_query_owner.parentId',
              },
            },
          };
        }

        static async beforeUpdate({ asFindQuery }) {
          hookResults.push({
            all: await asFindQuery(),
            first: await asFindQuery().first(),
            missing: await asFindQuery().where('as_find_query_owner.id', -1).first(),
          });
        }
      };

      Person.knex(knex);
    });

    beforeEach(async () => {
      await knex('as_find_query_owner').delete();
      await knex('as_find_query_owner').insert([
        { id: 1, name: 'Jennifer' },
        { id: 2, name: 'Brad', parentId: 1 },
      ]);
      hookResults = [];
    });

    const writes = {
      'where()': () => Person.query().where('id', 2),
      'findById()': () => Person.query().findById(2),
      '$query()': () => Person.fromJson({ id: 2 }).$query(),
      'a to-one $relatedQuery()': () => Person.fromJson({ id: 1 }).$relatedQuery('child'),
    };

    for (const [name, query] of Object.entries(writes)) {
      it(`should resolve to an array, and to one model or undefined with first(), for ${name}`, async () => {
        await query().patch({ name: 'Updated' });

        expect(hookResults).toHaveLength(1);
        const [{ all, first, missing }] = hookResults;
        expect(all.map((it) => it.id)).toEqual([2]);
        expect(first).toBeInstanceOf(Person);
        expect(first.id).toBe(2);
        expect(missing).toBeUndefined();
      });
    }
  });
};
