import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('many-to-many patch with join table extras of rows with binary ids (#287)', () => {
    const { knex } = session;
    const binaryId = (byte) => Buffer.from([...new Array(15).fill(0), byte]);

    let Owner;
    let Item;

    beforeAll(async () => {
      await knex.schema
        .dropTableIfExists('binary_ids_owners_items')
        .dropTableIfExists('binary_ids_items')
        .dropTableIfExists('binary_ids_owners')
        .createTable('binary_ids_owners', (table) => {
          table.integer('id').primary();
        })
        .createTable('binary_ids_items', (table) => {
          table.binary('id', 16).primary();
          table.string('name');
        })
        .createTable('binary_ids_owners_items', (table) => {
          table.integer('ownerId');
          table.binary('itemId', 16);
          table.string('extra');
        });

      Item = class Item extends Model {
        static get tableName() {
          return 'binary_ids_items';
        }
      };

      Owner = class Owner extends Model {
        static get tableName() {
          return 'binary_ids_owners';
        }

        static get relationMappings() {
          return {
            items: {
              relation: Model.ManyToManyRelation,
              modelClass: Item,
              join: {
                from: 'binary_ids_owners.id',
                through: {
                  from: 'binary_ids_owners_items.ownerId',
                  to: 'binary_ids_owners_items.itemId',
                  extra: ['extra'],
                },
                to: 'binary_ids_items.id',
              },
            },
          };
        }
      };

      Owner.knex(knex);
      Item.knex(knex);

      await knex('binary_ids_owners').insert({ id: 1 });
      await knex('binary_ids_items').insert([
        { id: binaryId(1), name: 'a' },
        { id: binaryId(2), name: 'a' },
      ]);
      await knex('binary_ids_owners_items').insert([
        { ownerId: 1, itemId: binaryId(1), extra: 'x' },
        { ownerId: 1, itemId: binaryId(2), extra: 'x' },
      ]);
    });

    afterAll(() => {
      return knex.schema
        .dropTableIfExists('binary_ids_owners_items')
        .dropTableIfExists('binary_ids_items')
        .dropTableIfExists('binary_ids_owners');
    });

    it('should patch and find the related rows by their binary ids', async () => {
      let foundNames = null;
      Item.afterUpdate = async ({ asFindQuery }) => {
        foundNames = (await asFindQuery()).map((item) => item.name);
      };

      const owner = await Owner.query().findById(1);
      const numUpdated = await owner
        .$relatedQuery('items')
        .patch({ name: 'b', extra: 'y' })
        .where('binary_ids_owners_items.extra', 'x');

      expect(numUpdated).toBe(2);
      expect(foundNames).toEqual(['b', 'b']);
      expect(await knex('binary_ids_items').pluck('name')).toEqual(['b', 'b']);
      expect(await knex('binary_ids_owners_items').pluck('extra')).toEqual(['y', 'y']);
    });
  });
};
