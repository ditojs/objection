import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('generated id', () => {
    let TestModel;

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('generated_id_test')
        .createTable('generated_id_test', (table) => {
          table.string('idCol', 32).primary();
          table.string('value');
        });
    });

    afterAll(() => {
      return session.knex.schema.dropTableIfExists('generated_id_test');
    });

    beforeAll(() => {
      TestModel = class TestModel extends Model {
        static get tableName() {
          return 'generated_id_test';
        }

        static get idColumn() {
          return 'idCol';
        }

        $beforeInsert() {
          this.idCol = 'someRandomId';
        }
      };

      TestModel.knex(session.knex);
    });

    it('should return the generated id when inserted', () => {
      return TestModel.query()
        .insert({ value: 'hello' })
        .then((ret) => {
          expect(ret.idCol).toBe('someRandomId');
          return session.knex(TestModel.getTableName());
        })
        .then((rows) => {
          expect(rows[0]).toEqual({ value: 'hello', idCol: 'someRandomId' });
        });
    });
  });
};
