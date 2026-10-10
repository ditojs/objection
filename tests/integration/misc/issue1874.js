import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe(`upsertGraph should not consider JSON values loosely equal to primitives #1874`, () => {
    let knex = session.knex;
    let Item;
    let updates;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('issue1874_items')
        .createTable('issue1874_items', (table) => {
          table.integer('id').primary();
          table.boolean('flag');
          table.text('data');
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('issue1874_items');
    });

    beforeAll(() => {
      Item = class Item extends Model {
        static get tableName() {
          return 'issue1874_items';
        }

        static get jsonAttributes() {
          return ['data'];
        }

        $beforeUpdate() {
          updates++;
        }
      };

      Item.knex(knex);
    });

    beforeEach(async () => {
      updates = 0;
      await knex('issue1874_items').delete();
      await Item.query().insert({ id: 1, flag: true, data: false });
    });

    it('should update `false` to `[]`', async () => {
      await Item.query().upsertGraph({ id: 1, data: [] });
      const item = await Item.query().findById(1);

      expect(updates).toBe(1);
      expect(item.data).toEqual([]);
    });

    it('should update `[]` to `false`', async () => {
      await Item.query().patch({ data: [] });
      await Item.query().upsertGraph({ id: 1, data: false });
      const item = await Item.query().findById(1);

      expect(updates).toBe(2);
      expect(item.data).toBe(false);
    });

    it('should still consider loosely equal primitives unchanged', async () => {
      await Item.query().upsertGraph({ id: 1, flag: 1, data: false });

      expect(updates).toBe(0);
    });
  });
};
