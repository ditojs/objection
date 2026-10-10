import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('Default values not set with .insertGraph() in 0.7.2 #325', () => {
    let TestModel;

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('default_values_note_set_test')
        .createTable('default_values_note_set_test', (table) => {
          table.increments('id').primary();
          table.string('value1');
          table.string('value2');
        });
    });

    afterAll(() => {
      return session.knex.schema.dropTableIfExists('default_values_note_set_test');
    });

    beforeAll(() => {
      TestModel = class TestModel extends Model {
        static get tableName() {
          return 'default_values_note_set_test';
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              value1: { type: 'string', default: 'foo' },
              value2: { type: 'string', default: 'bar' },
            },
          };
        }
      };

      TestModel.knex(session.knex);
    });

    beforeEach(() => {
      return TestModel.query().delete();
    });

    it('insert should set the defaults', () => {
      return TestModel.query()
        .insert({ value1: 'hello' })
        .then((model) => {
          expect(model.value1).toBe('hello');
          expect(model.value2).toBe('bar');
          return session.knex(TestModel.getTableName());
        })
        .then((rows) => {
          expect(rows[0].value1).toBe('hello');
          expect(rows[0].value2).toBe('bar');
        });
    });

    it('insertGraph should set the defaults', () => {
      return TestModel.query()
        .insertGraph({ value1: 'hello' })
        .then((model) => {
          expect(model.value1).toBe('hello');
          expect(model.value2).toBe('bar');
          return session.knex(TestModel.getTableName());
        })
        .then((rows) => {
          expect(rows[0].value1).toBe('hello');
          expect(rows[0].value2).toBe('bar');
        });
    });
  });
};
