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

    it('should move the row to a new owner without unrelating it first', async () => {
      await Owner.query().upsertGraph(
        [
          { id: 1, pets: [] },
          { id: 3, pets: [{ id: 1 }] },
        ],
        { relate: true, unrelate: true, insertMissing: true },
      );

      expect(await knex('moved_rows_pet')).toEqual([{ id: 1, ownerId: 3 }]);
    });
  });

  describe('upsertGraph() changing keys that are part of ids', () => {
    const { knex } = session;

    class Tag extends Model {
      static get tableName() {
        return 'moved_ids_tag';
      }
    }

    class Collar extends Model {
      static get tableName() {
        return 'moved_ids_collar';
      }

      static get idColumn() {
        return ['ownerId', 'name'];
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Owner,
            join: { from: 'moved_ids_collar.ownerId', to: 'moved_ids_owner.id' },
          },
          tags: {
            relation: Model.HasManyRelation,
            modelClass: Tag,
            join: {
              from: ['moved_ids_collar.ownerId', 'moved_ids_collar.name'],
              to: ['moved_ids_tag.collarOwnerId', 'moved_ids_tag.collarName'],
            },
          },
        };
      }
    }

    class Badge extends Model {
      static get tableName() {
        return 'moved_ids_badge';
      }

      static get idColumn() {
        return ['ownerCode', 'name'];
      }
    }

    class Owner extends Model {
      static get tableName() {
        return 'moved_ids_owner';
      }

      static get relationMappings() {
        return {
          collars: {
            relation: Model.HasManyRelation,
            modelClass: Collar,
            join: { from: 'moved_ids_owner.id', to: 'moved_ids_collar.ownerId' },
          },
          badges: {
            relation: Model.HasManyRelation,
            modelClass: Badge,
            join: { from: 'moved_ids_owner.code', to: 'moved_ids_badge.ownerCode' },
          },
        };
      }
    }

    const tables = ['moved_ids_tag', 'moved_ids_badge', 'moved_ids_collar', 'moved_ids_owner'];

    const dropTables = async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }
    };

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('moved_ids_owner', (table) => {
          table.integer('id').primary();
          table.string('code');
        })
        .createTable('moved_ids_collar', (table) => {
          table.integer('ownerId');
          table.string('name');
          table.primary(['ownerId', 'name']);
        })
        .createTable('moved_ids_badge', (table) => {
          table.string('ownerCode');
          table.string('name');
          table.primary(['ownerCode', 'name']);
        })
        .createTable('moved_ids_tag', (table) => {
          table.integer('id').primary();
          table.string('label');
          table.integer('collarOwnerId');
          table.string('collarName');
        });

      Owner.knex(knex);
    });

    beforeEach(async () => {
      await knex('moved_ids_owner').insert([
        { id: 1, code: 'x' },
        { id: 2, code: 'y' },
      ]);
      await knex('moved_ids_collar').insert([
        { ownerId: 1, name: 'a' },
        { ownerId: 2, name: 'b' },
      ]);
      await knex('moved_ids_badge').insert({ ownerCode: 'x', name: 'a' });
      await knex('moved_ids_tag').insert({ id: 1, label: 't', collarOwnerId: 1, collarName: 'a' });
    });

    afterEach(async () => {
      for (const table of tables) {
        await knex(table).delete();
      }
    });

    afterAll(dropTables);

    async function expectUnchanged() {
      expect(await knex('moved_ids_collar').orderBy('ownerId')).toEqual([
        { ownerId: 1, name: 'a' },
        { ownerId: 2, name: 'b' },
      ]);
      expect(await knex('moved_ids_tag')).toEqual([
        { id: 1, label: 't', collarOwnerId: 1, collarName: 'a' },
      ]);
    }

    it('should reject a move that would change the id of the row', async () => {
      for (const collar of [
        { ownerId: 1, name: 'a' },
        { ownerId: 1, name: 'a', tags: [{ id: 1, label: 'changed' }] },
      ]) {
        await expect(
          Owner.query().upsertGraph(
            { id: 2, collars: [{ ownerId: 2, name: 'b' }, collar] },
            { relate: true },
          ),
        ).rejects.toThrow(
          "the graph changes the key of the Collar at 'collars[1]' through collars, which is part of its id",
        );
        await expectUnchanged();
      }
    });

    it('should reject a relate of an owner that would change the id of the row', async () => {
      for (const owner of [{ id: 2 }, { id: 3, code: 'z' }]) {
        await expect(
          Collar.query(knex).upsertGraph(
            { ownerId: 1, name: 'a', owner },
            { relate: true, insertMissing: true },
          ),
        ).rejects.toThrow(
          'the graph changes the key of the Collar at the root through owner, which is part of its id',
        );
        await expectUnchanged();
      }
    });

    it('should reject clearing the owner of a row whose id contains the foreign key', async () => {
      for (const owner of [null, { id: 1, '#unrelate': true }, { id: 1, '#delete': true }]) {
        await expect(
          Collar.query(knex).upsertGraph(
            { ownerId: 1, name: 'a', owner },
            { relate: true, allowMarkers: true },
          ),
        ).rejects.toThrow(
          'the graph changes the key of the Collar at the root through owner, which is part of its id',
        );
        await expectUnchanged();
      }
    });

    it('should accept marking an owner that is not the owner of the row', async () => {
      await Collar.query(knex).upsertGraph(
        { ownerId: 1, name: 'a', owner: { id: 2, '#unrelate': true } },
        { relate: true, allowMarkers: true },
      );
      await expectUnchanged();
    });

    it('should accept a row at its place whose id contains the foreign key', async () => {
      await Owner.query().upsertGraph(
        { id: 1, collars: [{ ownerId: 1, name: 'a', tags: [{ id: 1, label: 'changed' }] }] },
        { relate: true },
      );

      expect(await knex('moved_ids_tag')).toEqual([
        { id: 1, label: 'changed', collarOwnerId: 1, collarName: 'a' },
      ]);
    });

    it('should accept a #ref to a new row of the same owner', async () => {
      await Owner.query().upsertGraph(
        { id: 1, collars: [{ ownerId: 1, name: 'a' }, { '#id': 'c', name: 'c' }, { '#ref': 'c' }] },
        { relate: true, allowRefs: true },
      );

      expect(await knex('moved_ids_collar').where('ownerId', 1).orderBy('name')).toEqual([
        { ownerId: 1, name: 'a' },
        { ownerId: 1, name: 'c' },
      ]);
    });

    it('should accept a #ref to a row of the same owner through a key that is not its id', async () => {
      await Owner.query().upsertGraph(
        { id: 1, badges: [{ '#id': 'b', ownerCode: 'x', name: 'a' }, { '#ref': 'b' }] },
        { relate: true, allowRefs: true },
      );

      expect(await knex('moved_ids_badge')).toEqual([{ ownerCode: 'x', name: 'a' }]);
    });
  });
};
