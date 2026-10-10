import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe(`withGraphJoined() should throw for models without a primary key #2748`, () => {
    let knex = session.knex;
    let Owner;
    let Item;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('issue2748_items')
        .dropTableIfExists('issue2748_owners')
        .createTable('issue2748_owners', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('issue2748_items', (table) => {
          table.integer('ownerId');
          table.string('name');
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('issue2748_items').dropTableIfExists('issue2748_owners');
    });

    beforeAll(() => {
      Owner = class Owner extends Model {
        static get tableName() {
          return 'issue2748_owners';
        }

        static get relationMappings() {
          return {
            items: {
              relation: Model.HasManyRelation,
              modelClass: Item,
              join: {
                from: 'issue2748_owners.id',
                to: 'issue2748_items.ownerId',
              },
            },
          };
        }
      };

      Item = class Item extends Model {
        static get tableName() {
          return 'issue2748_items';
        }

        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Owner,
              join: {
                from: 'issue2748_items.ownerId',
                to: 'issue2748_owners.id',
              },
            },
          };
        }
      };

      Owner.knex(knex);
      Item.knex(knex);
    });

    beforeAll(async () => {
      await knex('issue2748_owners').insert([
        { id: 1, name: 'o1' },
        { id: 2, name: 'o2' },
      ]);

      await knex('issue2748_items').insert([
        { ownerId: 1, name: 'i1' },
        { ownerId: 1, name: 'i2' },
        { ownerId: 2, name: 'i3' },
      ]);
    });

    const expectError = async (query, modelName) => {
      let error = null;

      try {
        await query;
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain(`model ${modelName}`);
      expect(error.message).toContain('withGraphFetched');
    };

    it('should throw if a related table has no id column', () => {
      return expectError(Owner.query().withGraphJoined('items'), 'Item');
    });

    it('should throw if the root table has no id column', () => {
      return expectError(Item.query().withGraphJoined('owner'), 'Item');
    });

    it('withGraphFetched() should still work', async () => {
      const owners = await Owner.query().withGraphFetched('items').orderBy('id');

      expect(owners.map((it) => it.items.length)).toEqual([2, 1]);
    });
  });
};
