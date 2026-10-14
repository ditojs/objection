import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { insertRowsWithIds } from '../../../testUtils/testUtils.js';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() #ref cycles through existing models', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'graph_ref_cycle_person';
      }

      static get relationMappings() {
        return {
          boss: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_ref_cycle_person.bossId', to: 'graph_ref_cycle_person.id' },
          },
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_ref_cycle_person.parentId', to: 'graph_ref_cycle_person.id' },
          },
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'graph_ref_cycle_person.id', to: 'graph_ref_cycle_person.parentId' },
          },
          // Joined through a column that isn't the id:
          mentor: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: {
              from: 'graph_ref_cycle_person.mentorName',
              to: 'graph_ref_cycle_person.name',
            },
          },
        };
      }
    }

    beforeAll(async () => {
      await knex.schema.dropTableIfExists('graph_ref_cycle_person');
      await knex.schema.createTable('graph_ref_cycle_person', (table) => {
        table.increments('id');
        table.string('name');
        table.integer('bossId');
        table.integer('parentId');
        table.string('mentorName');
      });
    });

    beforeEach(async () => {
      await knex('graph_ref_cycle_person').truncate();

      for (const name of ['a', 'b']) {
        await knex('graph_ref_cycle_person').insert({ name });
      }
    });

    afterAll(() => knex.schema.dropTableIfExists('graph_ref_cycle_person'));

    const getPerson = (id) => knex('graph_ref_cycle_person').where('id', id).first();

    it('should relate a model to itself', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, '#id': 'a', boss: { '#ref': 'a' } },
        { allowRefs: true, relate: true },
      );

      expect((await getPerson(1)).bossId).toBe(1);
    });

    it('should relate existing models to each other', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, '#id': 'a', boss: { id: 2, boss: { '#ref': 'a' } } },
        { allowRefs: true, relate: true },
      );

      expect((await getPerson(1)).bossId).toBe(2);
      expect((await getPerson(2)).bossId).toBe(1);
    });

    // The key that the relation reads from the referenced model is filled in by
    // the graph, so the `#ref` still waits for it:
    it('should read the key of a #ref once the graph fills it in', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 1, name: 'renamed #ref{n.name}' },
          { id: 2, mentor: { '#ref': 'a' } },
          { '#id': 'n', name: 'new' },
        ],
        { allowRefs: true, insertMissing: true },
      );

      expect((await getPerson(2)).mentorName).toBe('renamed new');
    });

    // The cycle runs through an existing row whose property is a #ref{} itself,
    // so we throw before writing the half-resolved strings:
    it('should reject a #ref{} cycle through an existing model before writing anything', async () => {
      const err = await Person.query(knex)
        .upsertGraph(
          [
            {
              children: [
                {
                  id: 2,
                  boss: {
                    parent: { id: 1, '#id': 'u7', name: 'ref #ref{u12.name}' },
                  },
                },
              ],
            },
            { '#id': 'u12', name: 'ref #ref{u7.name}' },
          ],
          { allowRefs: true, relate: true },
        )
        .catch((err) => err);

      expect(err.message).toBe('the object graph contains cyclic references');
      expect(await knex('graph_ref_cycle_person').select('id', 'name')).toEqual([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]);
    });
  });

  describe('upsertGraph() #ref values in key columns', () => {
    const { knex } = session;

    class Badge extends Model {
      static get tableName() {
        return 'graph_ref_key_badge';
      }
    }

    class Category extends Model {
      static get tableName() {
        return 'graph_ref_key_category';
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'graph_ref_key_pet';
      }

      static get relationMappings() {
        return {
          siblings: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_ref_key_pet.ownerId', to: 'graph_ref_key_pet.ownerId' },
          },
          category: {
            relation: Model.BelongsToOneRelation,
            modelClass: Category,
            join: { from: 'graph_ref_key_pet.categoryId', to: 'graph_ref_key_category.id' },
          },
        };
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'graph_ref_key_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_ref_key_person.id', to: 'graph_ref_key_pet.ownerId' },
          },
          favoritePet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: { from: 'graph_ref_key_person.favoritePetId', to: 'graph_ref_key_pet.id' },
          },
          // Joined through a column that isn't the id:
          badges: {
            relation: Model.HasManyRelation,
            modelClass: Badge,
            join: { from: 'graph_ref_key_person.code', to: 'graph_ref_key_badge.personCode' },
          },
        };
      }
    }

    const tables = [
      'graph_ref_key_badge',
      'graph_ref_key_pet',
      'graph_ref_key_person',
      'graph_ref_key_category',
    ];

    beforeAll(async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }

      await knex.schema
        .createTable('graph_ref_key_category', (table) => {
          table.increments('id');
          table.string('name');
        })
        .createTable('graph_ref_key_person', (table) => {
          table.increments('id');
          table.string('name');
          table.string('code');
          table.integer('favoritePetId');
        })
        .createTable('graph_ref_key_pet', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('ownerId');
          table.integer('categoryId');
        })
        .createTable('graph_ref_key_badge', (table) => {
          table.increments('id');
          table.string('name');
          table.string('personCode');
        });
    });

    beforeEach(async () => {
      for (const table of tables) {
        await knex(table).truncate();
      }
    });

    afterAll(async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }
    });

    // A #ref{} in a key column is no value yet: the rows keyed on it wait for
    // the reference instead of getting the raw string:
    it('should give the rows keyed on a #ref{} key column its resolved value', async () => {
      await insertRowsWithIds(knex, 'graph_ref_key_person', [{ id: 1, name: 'p1', code: 'c1' }]);
      await insertRowsWithIds(knex, 'graph_ref_key_badge', [
        { id: 300, name: 'b1', personCode: 'c1' },
      ]);

      await Person.query(knex).upsertGraph(
        [
          { '#id': 'n', name: 'nn' },
          { id: 1, code: '#ref{n.name}' },
          { id: 1, badges: [{ id: 300 }, { name: 'nb' }] },
        ],
        { allowRefs: true },
      );

      expect(await knex('graph_ref_key_person').where('id', 1).first()).toMatchObject({
        code: 'nn',
      });
      expect(await knex('graph_ref_key_badge').select('name', 'personCode').orderBy('id')).toEqual([
        { name: 'b1', personCode: 'nn' },
        { name: 'nb', personCode: 'nn' },
      ]);
    });

    // A whole #ref{} in the key that the pet's own place sets wins, as in 3.x
    // (Vincit#1378):
    it('should write a #ref{} key over the key that the place sets', async () => {
      await Person.query(knex).insertGraph(
        [
          { '#id': 'k', name: 'k' },
          { name: 'r', pets: [{ name: 'pet', ownerId: '#ref{k.id}' }] },
        ],
        { allowRefs: true },
      );

      const k = await knex('graph_ref_key_person').where('name', 'k').first();
      expect(await knex('graph_ref_key_pet').where('name', 'pet').first()).toMatchObject({
        ownerId: k.id,
      });
    });

    // The foreign key is a #ref{} at one place, and another place's new sibling
    // reads it, so both get the id of the new row:
    it('should give a new row the key that a #ref{} sets at another place', async () => {
      await insertRowsWithIds(knex, 'graph_ref_key_person', [
        { id: 2, name: 'p2' },
        { id: 4, name: 'p4' },
      ]);
      await insertRowsWithIds(knex, 'graph_ref_key_pet', [{ id: 3, name: 'pet3', ownerId: 2 }]);

      await Person.query(knex).upsertGraph(
        [
          { '#id': 'np', name: 'NP' },
          { id: 4, favoritePet: { id: 3, ownerId: '#ref{np.id}' } },
          { id: 2, favoritePet: { id: 3, siblings: [{ name: 'n' }] } },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const { id } = await knex('graph_ref_key_person').where('name', 'NP').first();
      expect(await knex('graph_ref_key_pet').select('name', 'ownerId').orderBy('id')).toEqual([
        { name: 'pet3', ownerId: id },
        { name: 'n', ownerId: id },
      ]);
    });

    // The #ref{} cycle runs through the pet that moves to person 2, so we
    // throw before the move is written:
    it('should reject a #ref{} cycle through a moved model before writing anything', async () => {
      await insertRowsWithIds(knex, 'graph_ref_key_category', [{ id: 5, name: 'cats' }]);
      await insertRowsWithIds(knex, 'graph_ref_key_person', [
        { id: 1, name: 'p1' },
        { id: 2, name: 'p2' },
      ]);
      await insertRowsWithIds(knex, 'graph_ref_key_pet', [
        { id: 10, name: 'Fluffy', ownerId: 1, categoryId: 5 },
        { id: 11, name: 'Rex', ownerId: 2 },
      ]);

      const err = await Person.query(knex)
        .upsertGraph(
          [
            {
              id: 2,
              pets: [
                { id: 11 },
                { id: 10, category: { id: 5, '#id': 'c', name: 'ref #ref{o.name}' } },
              ],
            },
            { '#id': 'o', name: 'ref #ref{c.name}' },
          ],
          { relate: true, allowRefs: true },
        )
        .catch((err) => err);

      expect(err.message).toBe('the object graph contains cyclic references');
      expect(await knex('graph_ref_key_person')).toHaveLength(2);
      expect(await knex('graph_ref_key_category').select('name')).toEqual([{ name: 'cats' }]);
      expect(await knex('graph_ref_key_pet').select('id', 'ownerId').orderBy('id')).toEqual([
        { id: 10, ownerId: 1 },
        { id: 11, ownerId: 2 },
      ]);
    });
  });
};
