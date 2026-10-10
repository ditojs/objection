import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('zero value in relation column', () => {
    let Table1;
    let Table2;

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('table1')
        .dropTableIfExists('table2')
        .createTable('table1', (table) => {
          table.increments('id').primary();
          table.integer('value').notNullable();
        })
        .createTable('table2', (table) => {
          table.increments('id').primary();
          table.integer('value').notNullable();
        });
    });

    afterAll(() => {
      return Promise.all([
        session.knex.schema.dropTableIfExists('table1'),
        session.knex.schema.dropTableIfExists('table2'),
      ]);
    });

    beforeAll(() => {
      Table1 = class Table1 extends Model {
        static get tableName() {
          return 'table1';
        }

        static get relationMappings() {
          return {
            relation: {
              relation: Model.HasManyRelation,
              modelClass: Table2,
              join: {
                from: 'table1.value',
                to: 'table2.value',
              },
            },
          };
        }
      };

      Table2 = class Table2 extends Model {
        static get tableName() {
          return 'table2';
        }
      };

      Table1.knex(session.knex);
      Table2.knex(session.knex);
    });

    beforeAll(() => {
      return Promise.all([
        Table1.query().insert({ id: 1, value: 0 }),
        Table1.query().insert({ id: 2, value: 1 }),
        Table2.query().insert({ id: 1, value: 0 }),
        Table2.query().insert({ id: 2, value: 1 }),
      ]);
    });

    it('should work with zero value', () => {
      return Table1.query()
        .findById(1)
        .then((model) => {
          return model.$relatedQuery('relation');
        })
        .then((models) => {
          expect(models).toEqual([{ id: 1, value: 0 }]);
        });
    });
  });
};
