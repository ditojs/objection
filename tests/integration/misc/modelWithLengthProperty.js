import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('model with `length` property', () => {
    let TestModel;

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('model_with_length_test')
        .createTable('model_with_length_test', (table) => {
          table.increments('id');
          table.integer('length');
        });
    });

    afterAll(() => {
      return session.knex.schema.dropTableIfExists('model_with_length_test');
    });

    beforeAll(() => {
      TestModel = class TestModel extends Model {
        static get tableName() {
          return 'model_with_length_test';
        }
      };

      TestModel.knex(session.knex);
    });

    it('should insert', () => {
      return TestModel.query()
        .insert({ length: 10 })
        .then((model) => {
          expect(model).toEqual({ id: 1, length: 10 });
          return session.knex(TestModel.getTableName());
        })
        .then((rows) => {
          expect(rows.length).toBe(1);
          expect(rows[0]).toEqual({ id: 1, length: 10 });
        });
    });
  });
};
