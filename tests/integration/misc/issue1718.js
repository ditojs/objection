import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Model } from 'objection';
import { AjvValidator } from '../../../lib/model/AjvValidator.js';
import { ValidationError } from '../../../lib/model/ValidationError.js';

export default (session) => {
  describe('Pass through data in exceptions when Ajv verbose option is enabled #1718', () => {
    class MyModel extends Model {
      static get tableName() {
        return 'MyModel';
      }

      static createValidator() {
        return new AjvValidator({
          options: {
            allErrors: true,
            validateSchema: false,
            ownProperties: true,
            v5: true,
            verbose: true,
          },
        });
      }

      static get jsonSchema() {
        return {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' },
          },
        };
      }
    }

    beforeEach(() => {
      return session.knex.schema
        .dropTableIfExists('MyModel')
        .createTable('MyModel', (table) => {
          table.integer('id').primary();
        })
        .then(() => {
          return Promise.all([session.knex('MyModel').insert({ id: 1 })]);
        });
    });

    afterEach(() => {
      return session.knex.schema.dropTableIfExists('MyModel');
    });

    it('test', () => {
      return MyModel.query(session.knex)
        .insert({ id: 2 })
        .catch((err) => {
          expect(err).toBeInstanceOf(ValidationError);
          expect(err.data).toBeTypeOf('object');
          expect(err.data.id).toBeInstanceOf(Array);
          expect(err.data).toEqual({
            id: [
              {
                message: 'must be integer',
                keyword: 'type',
                params: { type: 'integer' },
                data: '2',
              },
            ],
          });
        });
    });
  });
};
