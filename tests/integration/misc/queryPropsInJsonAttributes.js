import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model, raw } from 'objection';

export default (session) => {
  describe('query properties set on json attributes in $beforeInsert() and $beforeUpdate()', () => {
    const { knex } = session;

    class Item extends Model {
      static get tableName() {
        return 'queryPropsInJsonAttributes';
      }

      static get jsonSchema() {
        return {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            meta: { type: ['object', 'null'] },
          },
        };
      }

      $beforeInsert() {
        this.meta = raw('?', JSON.stringify({ hook: 'insert' }));
      }

      $beforeUpdate() {
        this.meta = raw('?', JSON.stringify({ hook: 'update' }));
      }
    }

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('queryPropsInJsonAttributes')
        .createTable('queryPropsInJsonAttributes', (table) => {
          table.integer('id').primary();
          table.text('meta');
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('queryPropsInJsonAttributes');
    });

    beforeEach(() => {
      return knex('queryPropsInJsonAttributes').delete();
    });

    it('insert() should write the query property', async () => {
      await Item.query(knex).insert({ id: 1 });
      const item = await Item.query(knex).findById(1);
      expect(item.meta).toEqual({ hook: 'insert' });
    });

    it('patch() should write the query property', async () => {
      await Item.query(knex).insert({ id: 1 });
      await Item.query(knex).patch({}).where('id', 1);
      const item = await Item.query(knex).findById(1);
      expect(item.meta).toEqual({ hook: 'update' });
    });

    it('$query().patch() should write the query property', async () => {
      const item = await Item.query(knex).insert({ id: 1 });
      await item.$query(knex).patch();
      const { meta } = await Item.query(knex).findById(1);
      expect(meta).toEqual({ hook: 'update' });
    });
  });
};
