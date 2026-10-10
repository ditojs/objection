import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  if (session.isMySql()) {
    describe('mysql binary columns', () => {
      let TestModel;

      beforeAll(() => {
        return session.knex.schema
          .dropTableIfExists('mysql_binary_test')
          .createTable('mysql_binary_test', (table) => {
            table.increments('id').primary();
            table.binary('binary', 4);
          });
      });

      afterAll(() => {
        return session.knex.schema.dropTableIfExists('mysql_binary_test');
      });

      beforeAll(() => {
        TestModel = class TestModel extends Model {
          static get tableName() {
            return 'mysql_binary_test';
          }
        };

        TestModel.knex(session.knex);
      });

      function buffer() {
        return Buffer.from([192, 168, 163, 17]);
      }

      function bufferEquals(a, b) {
        if (!Buffer.isBuffer(a)) return false;
        if (!Buffer.isBuffer(b)) return false;
        if (typeof a.equals === 'function') return a.equals(b);
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return false;
        }

        return true;
      }

      it('#insert should insert a buffer', () => {
        return TestModel.query()
          .insert({ binary: buffer() })
          .then((ret) => {
            expect(bufferEquals(buffer(), ret.binary)).toBe(true);
            return session.knex(TestModel.getTableName());
          })
          .then((rows) => {
            expect(bufferEquals(buffer(), rows[0].binary)).toBe(true);
          });
      });
    });
  }
};
