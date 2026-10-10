import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() moving rows to another owner with a NOT NULL foreign key (#214)', () => {
    const { knex } = session;

    class Pet extends Model {
      static get tableName() {
        return 'moved_rows_pet';
      }
    }

    class Owner extends Model {
      static get tableName() {
        return 'moved_rows_owner';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'moved_rows_owner.id', to: 'moved_rows_pet.ownerId' },
          },
        };
      }
    }

    beforeAll(async () => {
      await knex.schema
        .dropTableIfExists('moved_rows_pet')
        .dropTableIfExists('moved_rows_owner')
        .createTable('moved_rows_owner', (table) => {
          table.integer('id').primary();
        })
        .createTable('moved_rows_pet', (table) => {
          table.integer('id').primary();
          table.integer('ownerId').notNullable().references('moved_rows_owner.id');
        });

      Owner.knex(knex);
    });

    beforeEach(async () => {
      await knex('moved_rows_owner').insert([{ id: 1 }, { id: 2 }]);
      await knex('moved_rows_pet').insert({ id: 1, ownerId: 1 });
    });

    afterEach(async () => {
      await knex('moved_rows_pet').delete();
      await knex('moved_rows_owner').delete();
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('moved_rows_pet').dropTableIfExists('moved_rows_owner');
    });

    it('should move the row without unrelating it first', async () => {
      await Owner.query().upsertGraph(
        [
          { id: 1, pets: [] },
          { id: 2, pets: [{ id: 1 }] },
        ],
        { relate: true },
      );

      expect(await knex('moved_rows_pet')).toEqual([{ id: 1, ownerId: 2 }]);
    });
  });
};
