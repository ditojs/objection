import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { insertRowsWithIds } from '../../../testUtils/testUtils.js';
import { Model, NotFoundError } from 'objection';

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

  describe('upsertGraph() writing the relations of moved rows in a later pass', () => {
    const { knex } = session;

    class Toy extends Model {
      static get tableName() {
        return 'moved_later_toy';
      }
    }

    class Badge extends Model {
      static get tableName() {
        return 'moved_later_badge';
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'moved_later_pet';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'moved_later_pet.ownerId', to: 'moved_later_person.id' },
          },
          siblings: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'moved_later_pet.ownerId', to: 'moved_later_pet.ownerId' },
          },
          toys: {
            relation: Model.HasManyRelation,
            modelClass: Toy,
            join: { from: 'moved_later_pet.id', to: 'moved_later_toy.petId' },
          },
        };
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'moved_later_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'moved_later_person.id', to: 'moved_later_pet.ownerId' },
          },
          sittedPets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'moved_later_person.id', to: 'moved_later_pet.sitterId' },
          },
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'moved_later_person.id', to: 'moved_later_person.parentId' },
          },
          favoritePet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: { from: 'moved_later_person.favoritePetId', to: 'moved_later_pet.id' },
          },
          badges: {
            relation: Model.HasManyRelation,
            modelClass: Badge,
            join: { from: 'moved_later_person.code', to: 'moved_later_badge.personCode' },
          },
        };
      }
    }

    const tables = [
      'moved_later_toy',
      'moved_later_badge',
      'moved_later_pet',
      'moved_later_person',
    ];

    const dropTables = async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }
    };

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('moved_later_person', (table) => {
          table.increments('id');
          table.string('name');
          table.string('code');
          table.integer('parentId');
          table.integer('favoritePetId');
        })
        .createTable('moved_later_pet', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('ownerId');
          table.integer('sitterId');
        })
        .createTable('moved_later_toy', (table) => {
          table.increments('id');
          table.integer('petId');
        })
        .createTable('moved_later_badge', (table) => {
          table.increments('id');
          table.string('name');
          table.string('personCode');
        });

      Person.knex(knex);
      Pet.knex(knex);
    });

    afterEach(async () => {
      for (const table of tables) {
        await knex(table).delete();
      }
    });

    afterAll(dropTables);

    const insertPersons = (...ids) =>
      insertRowsWithIds(
        knex,
        'moved_later_person',
        ids.map((id) => ({ id, name: `p${id}` })),
      );

    it('should relate a sibling of a row that lists itself in a moved place under noUpdate', async () => {
      // Pet 3 lists itself in the siblings of its moved place, which sets nothing,
      // so its other place relates pet 1 to its owner in this pass.
      await insertPersons(1, 2, 3, 4);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 1, ownerId: 1, sitterId: 2 },
        { id: 2, ownerId: 1 },
        { id: 3, ownerId: 2, sitterId: 3 },
        { id: 4, ownerId: 3 },
      ]);

      await Person.query().upsertGraph(
        {
          id: 4,
          sittedPets: [{ id: 3, siblings: [{ id: 3 }] }],
          favoritePet: { id: 3, siblings: [{ id: 1 }] },
        },
        { relate: true, noUpdate: true, noDelete: true },
      );

      expect(await knex('moved_later_pet').where('id', 1)).toMatchObject([{ ownerId: 2 }]);
    });

    it('should relate a row that a later pass gives its key under noUpdate', async () => {
      // The owner of pet 4 is set in the later pass of the moved pet 3, so pet 1
      // is related there, which writes its key also under `noUpdate`.
      await insertPersons(1, 2, 3, 4);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 1, ownerId: 1, sitterId: 2 },
        { id: 2, ownerId: 1 },
        { id: 3, ownerId: 2, sitterId: 3 },
        { id: 4, ownerId: 3 },
      ]);

      await Person.query().upsertGraph(
        [
          { id: 4, sittedPets: [{ id: 3, siblings: [{ id: 4 }] }] },
          { id: 1, favoritePet: { id: 4, siblings: [{ id: 1 }] } },
        ],
        { relate: true, noUpdate: true, noDelete: true },
      );

      expect(await knex('moved_later_pet').whereIn('id', [1, 4]).orderBy('id')).toMatchObject([
        { id: 1, ownerId: 2 },
        { id: 4, ownerId: 2 },
      ]);
    });

    it('should write the key of a BelongsToOne row that a later pass inserts', async () => {
      // The name of person 1's new favorite pet reads the id of a pet below the
      // moved person 2, so it is inserted in the later pass, and its key patched in there.
      await insertPersons(1, 2, 3);
      await insertRowsWithIds(knex, 'moved_later_pet', [{ id: 10, ownerId: 3 }]);

      await Person.query().upsertGraph(
        {
          id: 1,
          children: [{ id: 2, pets: [{ '#id': 'pet', name: 'x' }] }],
          favoritePet: { name: 'pet #ref{pet.id}' },
        },
        { relate: true, allowRefs: true },
      );

      const [{ favoritePetId }] = await knex('moved_later_person').where('id', 1);
      const [x] = await knex('moved_later_pet').where('name', 'x');
      expect(await knex('moved_later_pet').where('id', favoritePetId)).toMatchObject([
        { name: `pet ${x.id}` },
      ]);
    });

    it('should write the siblings of a moved row at the owner that it moves to', async () => {
      // Pet 1 moves to person 3 with its sitter, so its siblings are the pets of
      // person 3, and pet 2 stays with person 1.
      await insertPersons(1, 2, 3);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
        { id: 3, ownerId: 3 },
      ]);

      await Person.query().upsertGraph(
        { id: 2, sittedPets: [{ id: 1, owner: { id: 3 }, siblings: [] }] },
        { relate: true, unrelate: true },
      );

      expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([
        { id: 1, ownerId: 3, sitterId: 2 },
        { id: 2, ownerId: 1 },
        { id: 3, ownerId: null },
      ]);
    });

    it('should not move a row through an owner place that the relate option leaves out', async () => {
      // `relate` doesn't cover the owner of person 2's favorite pet, so pet 4
      // doesn't move, and relating person 1 there fails.
      await insertPersons(1, 2, 3);
      await insertRowsWithIds(knex, 'moved_later_pet', [{ id: 4, ownerId: 3 }]);

      const err = await Person.query()
        .upsertGraph(
          { id: 2, favoritePet: { id: 4, owner: { id: 1 }, siblings: [{ name: 'n' }] } },
          { relate: ['favoritePet'], noDelete: true },
        )
        .catch((err) => err);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([{ id: 4, ownerId: 3 }]);
    });

    it('should give the new sibling of a moved row in its other place the final owner', async () => {
      // The other place of pet 12 is written in a later pass, so we read its final owner.
      await insertPersons(1, 2, 3);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 10, ownerId: 2 },
        { id: 11, ownerId: 1 },
        { id: 12, ownerId: 3 },
      ]);

      await Pet.query().upsertGraph(
        [
          { id: 11, siblings: [{ id: 10, siblings: [{ id: 12 }] }] },
          { id: 12, siblings: [{ name: 'n' }] },
        ],
        { relate: true, noDelete: true },
      );

      expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([
        { id: 10, ownerId: 1 },
        { id: 11, ownerId: 1 },
        { id: 12, ownerId: 1 },
        { name: 'n', ownerId: 1 },
      ]);
    });

    it('should give the new sibling of a row whose owner a later pass sets the final owner', async () => {
      // Pet 12 is related to person 3 by its sibling pet 10, so its new sibling follows it there.
      await insertPersons(1, 2, 3);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 10, ownerId: 1 },
        { id: 11, ownerId: 2 },
        { id: 12, ownerId: 1 },
      ]);

      await Person.query().upsertGraph(
        [
          { id: 3, pets: [{ id: 10, siblings: [{ id: 12 }] }] },
          { id: 2, favoritePet: { id: 12, siblings: [{ name: 'x' }] } },
        ],
        { relate: true, noDelete: true },
      );

      expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([
        { id: 10, ownerId: 3 },
        { id: 11, ownerId: 2 },
        { id: 12, ownerId: 3 },
        { name: 'x', ownerId: 3 },
      ]);
    });

    it('should delete the previous BelongsToOne row of a moved row when it is replaced', async () => {
      // Moving person 2 must not keep pet 11, which its favoritePet replaces.
      await insertPersons(1, 3);
      await insertRowsWithIds(knex, 'moved_later_person', [
        { id: 2, parentId: 1, favoritePetId: 11 },
      ]);
      await insertRowsWithIds(knex, 'moved_later_pet', [{ id: 11 }, { id: 12 }]);

      await Person.query().upsertGraph(
        { id: 3, children: [{ id: 2, favoritePet: { id: 12 } }] },
        { relate: true },
      );

      expect(await knex('moved_later_person').where('id', 2)).toMatchObject([
        { parentId: 3, favoritePetId: 12 },
      ]);
      expect(await knex('moved_later_pet').pluck('id')).toEqual([12]);
    });

    it('should move the siblings of a moved row in its other place to its new owner', async () => {
      // Pet 4 follows its #ref to person B, and so does pet 5, which its other place lists.
      await insertPersons(1);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 4, ownerId: 1 },
        { id: 5, ownerId: 1 },
      ]);

      await Person.query().upsertGraph(
        [
          { name: 'A', favoritePet: { '#id': 'p', id: 4, siblings: [{ id: 5 }] } },
          { name: 'B', pets: [{ '#ref': 'p' }] },
        ],
        { allowRefs: true, relate: true },
      );

      const [{ id }] = await knex('moved_later_person').where('name', 'B');
      expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([
        { id: 4, ownerId: id },
        { id: 5, ownerId: id },
      ]);
    });

    it('should terminate with a #ref to a row with relations in a moved place', async () => {
      // The #ref row changes its code in the first root and gets its badges in the second.
      await insertRowsWithIds(knex, 'moved_later_person', [
        { id: 1, name: 'p1', code: 'c1', parentId: 99 },
        { id: 2, name: 'p2', code: 'c2' },
        { id: 99, name: 'root', code: 'c99' },
      ]);
      await insertRowsWithIds(knex, 'moved_later_badge', [
        { id: 300, name: 'b1', personCode: 'c1' },
        { id: 301, name: 'b2', personCode: 'c2' },
      ]);

      await Person.query().upsertGraph(
        [
          { id: 1, '#id': 'a', code: 'x' },
          { id: 2, children: [{ '#ref': 'a', badges: [{ id: 300 }, { name: 'nb' }] }] },
        ],
        { allowRefs: true, relate: true, noDelete: true },
      );

      expect(await knex('moved_later_person').where('id', 1)).toMatchObject([
        { code: 'x', parentId: 2 },
      ]);
      expect(await knex('moved_later_badge').orderBy('id')).toMatchObject([
        { id: 300, personCode: 'x' },
        { id: 301, personCode: 'c2' },
        { name: 'nb', personCode: 'x' },
      ]);
    });

    it('should terminate with a #dbRef to a row with relations in a moved place', async () => {
      // Pet 10 moves to person 2, and its toys: [] unrelates its toys.
      await insertPersons(1, 2);
      await insertRowsWithIds(knex, 'moved_later_pet', [
        { id: 10, ownerId: 1 },
        { id: 11, ownerId: 2 },
      ]);
      await insertRowsWithIds(knex, 'moved_later_toy', [
        { id: 100, petId: 10 },
        { id: 101, petId: 11 },
        { id: 102, petId: 10 },
      ]);

      await Person.query().upsertGraph(
        { id: 2, pets: [{ id: 11 }, { '#dbRef': 10, toys: [] }] },
        { relate: true, unrelate: true },
      );

      expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([
        { id: 10, ownerId: 2 },
        { id: 11, ownerId: 2 },
      ]);
      expect(await knex('moved_later_toy').orderBy('id')).toMatchObject([
        { id: 100, petId: null },
        { id: 101, petId: 11 },
        { id: 102, petId: null },
      ]);
    });

    it('should not depend on the order of the roots for a row that lists itself as its sibling', async () => {
      // Pet 1 is its own sibling at person 3 and is related to person 2, in either order.
      const roots = [
        { id: 3, sittedPets: [{ id: 1, siblings: [{ id: 1 }, { id: 2 }] }] },
        { id: 2, pets: [{ id: 1 }] },
      ];

      await insertPersons(1, 2, 3);

      for (const graph of [roots, [...roots].reverse()]) {
        await knex('moved_later_pet').delete();
        await insertRowsWithIds(knex, 'moved_later_pet', [
          { id: 1, ownerId: 1, sitterId: 3 },
          { id: 2 },
        ]);

        await Person.query().upsertGraph(graph, { relate: true });

        expect(await knex('moved_later_pet').orderBy('id')).toMatchObject([
          { id: 1, ownerId: 2, sitterId: 3 },
          { id: 2, ownerId: 2 },
        ]);
      }
    });
  });

  describe('upsertGraph() keys of related rows and references', () => {
    const { knex } = session;

    class Toy extends Model {
      static get tableName() {
        return 'review_keys_toy';
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'review_keys_pet';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'review_keys_pet.ownerId', to: 'review_keys_person.id' },
          },
          ownerByCode: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'review_keys_pet.ownerCode', to: 'review_keys_person.code' },
          },
          vet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'review_keys_pet.vetId', to: 'review_keys_person.id' },
          },
          siblings: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'review_keys_pet.ownerId', to: 'review_keys_pet.ownerId' },
          },
          toys: {
            relation: Model.HasManyRelation,
            modelClass: Toy,
            join: { from: 'review_keys_pet.id', to: 'review_keys_toy.petId' },
          },
        };
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'review_keys_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'review_keys_person.id', to: 'review_keys_pet.ownerId' },
          },
          codePets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'review_keys_person.code', to: 'review_keys_pet.ownerCode' },
          },
          favPet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: { from: 'review_keys_person.favPetId', to: 'review_keys_pet.id' },
          },
          liked: {
            relation: Model.ManyToManyRelation,
            modelClass: Pet,
            join: {
              from: 'review_keys_person.id',
              through: { from: 'review_keys_liked.personId', to: 'review_keys_liked.petId' },
              to: 'review_keys_pet.id',
            },
          },
        };
      }
    }

    const tables = [
      'review_keys_liked',
      'review_keys_toy',
      'review_keys_pet',
      'review_keys_person',
    ];

    const dropTables = async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }
    };

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('review_keys_person', (table) => {
          table.increments('id');
          table.string('name');
          table.string('code');
          table.integer('favPetId');
        })
        .createTable('review_keys_pet', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('ownerId');
          table.string('ownerCode');
          table.integer('vetId');
        })
        .createTable('review_keys_toy', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('petId');
        })
        .createTable('review_keys_liked', (table) => {
          table.integer('personId');
          table.integer('petId');
        });

      Person.knex(knex);
      Pet.knex(knex);
    });

    afterEach(async () => {
      for (const table of tables) {
        await knex(table).delete();
      }
    });

    afterAll(dropTables);

    const insertPersons = (...ids) =>
      insertRowsWithIds(
        knex,
        'review_keys_person',
        ids.map((id) => ({ id, name: `p${id}`, code: `c${id}` })),
      );

    it('should not write the raw key of a moved row under noUpdate while its owner is replaced', async () => {
      // Pet 1 moves to the code of person 2, so its given ownerId 3 must not be
      // written: the owner it keeps is the new one, and person 3 must survive.
      await insertPersons(1, 2, 3);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 1, ownerId: 1, ownerCode: 'c1' }]);

      await Person.query().upsertGraph(
        { id: 2, codePets: [{ id: 1, ownerId: 3, owner: { name: 'n' } }] },
        { relate: true, noUpdate: true },
      );

      const ids = (await knex('review_keys_person').orderBy('id')).map(({ id }) => id);
      expect(ids).not.toContain(1);
      expect(ids).toContain(3);
    });

    it('should write the key of a BelongsToOne relate on a column other than the id when inserting', async () => {
      await insertPersons(3);

      await Pet.query().insertGraph({ name: 'q', ownerByCode: { code: 'c3' } }, { relate: true });

      expect(await knex('review_keys_pet')).toMatchObject([{ name: 'q', ownerCode: 'c3' }]);
    });

    it('should write the key of a BelongsToOne relate on a column other than the id under noUpdate', async () => {
      await insertPersons(1, 3);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 10, ownerCode: 'c1' }]);

      await Pet.query().upsertGraph(
        { id: 10, ownerByCode: { code: 'c3' } },
        { relate: true, noUpdate: true },
      );

      expect(await knex('review_keys_pet')).toMatchObject([{ id: 10, ownerCode: 'c3' }]);
    });

    it('should write the key of a BelongsToOne relate with an id on a column other than the id', async () => {
      // Person 3 isn't loaded, so its code is the one that the graph relates it by.
      await insertPersons(1, 3);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 10, ownerCode: 'c1' }]);

      await Pet.query().insertGraph(
        { name: 'q', ownerByCode: { id: 3, code: 'c3' } },
        { relate: true },
      );
      await Pet.query().upsertGraph(
        { id: 10, ownerByCode: { id: 3, code: 'c3' } },
        { relate: true, noUpdate: true },
      );

      expect(await knex('review_keys_pet').orderBy('id')).toMatchObject([
        { id: 10, ownerCode: 'c3' },
        { name: 'q', ownerCode: 'c3' },
      ]);
    });

    it('should not wait for an existing model that a #ref{} reads the id of', async () => {
      // The id of person 1 is known, so the new pet doesn't wait for its write.
      await insertPersons(1);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 1, ownerId: 1 }]);

      await Person.query().upsertGraph(
        { id: 1, '#id': 'p', pets: [{ id: 1 }], favPet: { name: 'f', vetId: '#ref{p.id}' } },
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').where('name', 'f')).toMatchObject([{ vetId: 1 }]);
    });

    it('should keep the wait for a key when a cycle defers another key of the same row', async () => {
      // Pet n waits for person x for its owner, through the siblings of pet 1,
      // and for its vet. Breaking the cycle defers the vet, not the owner.
      await insertPersons(1);
      await insertRowsWithIds(knex, 'review_keys_pet', [
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
      ]);

      await Pet.query().upsertGraph(
        [
          {
            id: 1,
            owner: { '#ref': 'x' },
            siblings: [{ '#id': 'n', name: 'n', vet: { '#ref': 'x' } }],
          },
          { id: 2, vet: { '#id': 'x', name: 'x', favPet: { '#ref': 'n' } } },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [x] = await knex('review_keys_person').where('name', 'x');
      expect(await knex('review_keys_pet').where('name', 'n')).toMatchObject([
        { ownerId: x.id, vetId: x.id },
      ]);
    });

    it('should relate rows by a key that a #ref{} to a new id gives their owner', async () => {
      // Person 3's code is the id of the new person n, so pet 2 and the new pet
      // wait for n's insert instead of getting the old code.
      await insertPersons(3);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 2 }]);

      await Person.query().upsertGraph(
        [
          { id: 3, code: '#ref{n.id}', codePets: [{ id: 2 }, { name: 'np' }] },
          { '#id': 'n', name: 'zz' },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [n] = await knex('review_keys_person').where('name', 'zz');
      expect(await knex('review_keys_pet').orderBy('id')).toMatchObject([
        { id: 2, ownerCode: String(n.id) },
        { name: 'np', ownerCode: String(n.id) },
      ]);
    });

    it('should write the key of a BelongsToOne relate over a #ref{} under noUpdate', async () => {
      // Pet 2's own vet relate gives its vetId, as on next. A whole #ref{} only
      // wins at the place in its parent or on inserts.
      await insertPersons(1, 3, 4);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 1 }, { id: 2 }]);

      await Pet.query().upsertGraph(
        [
          { id: 2, vetId: '#ref{k.id}', vet: { id: 4 } },
          { id: 1, owner: { id: 3, '#id': 'k' } },
        ],
        { relate: true, noDelete: true, allowRefs: true, noUpdate: true },
      );

      expect(await knex('review_keys_pet').where('id', 2)).toMatchObject([{ vetId: 4 }]);
    });

    it('should give the siblings of a row the #ref{} key of its place', async () => {
      // Pet 3's ownerId #ref{} wins over the key of its place in person 2's pets,
      // so its new sibling follows it to person k.
      await insertPersons(2);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 3, ownerId: 2 }]);

      await Person.query().upsertGraph(
        [
          { '#id': 'k', name: 'k' },
          { id: 2, pets: [{ id: 3, ownerId: '#ref{k.id}', siblings: [{ name: 'ns' }] }] },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [k] = await knex('review_keys_person').where('name', 'k');
      expect(await knex('review_keys_pet').orderBy('id')).toMatchObject([
        { id: 3, ownerId: k.id },
        { name: 'ns', ownerId: k.id },
      ]);
    });

    it('should not write the key that a #ref model in a BelongsToOne sets for its row', async () => {
      // The #ref to pet 1 in person 2's favPet only places pet 1 there, so its
      // owner is ignored, and pet 1 and its sibling pet 2 stay at person 1.
      await insertPersons(1, 2, 3, 4);
      await insertRowsWithIds(knex, 'review_keys_pet', [
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
      ]);

      await Person.query().upsertGraph(
        [
          { id: 2, favPet: { '#ref': 'x', owner: { id: 4 } } },
          { id: 3, liked: [{ id: 1, '#id': 'x', siblings: [{ id: 2 }] }] },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').orderBy('id')).toMatchObject([
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
      ]);
    });

    it('should read the siblings of a row that its own owner moves at its old owner', async () => {
      // A known limit: moved through its own owner, pet 1's siblings are still
      // read at owner 1, so pet 2 is unrelated there, as in 3.x.
      await insertPersons(1, 2, 4);
      await insertRowsWithIds(knex, 'review_keys_pet', [
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
      ]);

      await Person.query().upsertGraph(
        { id: 2, favPet: { id: 1, owner: { id: 4 }, siblings: [] } },
        { relate: true, unrelate: true },
      );

      expect(await knex('review_keys_pet').orderBy('id')).toMatchObject([
        { id: 1, ownerId: 4 },
        { id: 2, ownerId: null },
      ]);
    });

    it('should not report cyclic references for two inserts of the same missing row', async () => {
      // Person 70 is inserted by two nodes, which fails in the database (on the
      // duplicate key, or on SQL Server on the explicit id), but is no cycle.
      await insertPersons(2);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 3, ownerId: 2 }]);

      const error = await Pet.query()
        .upsertGraph(
          [
            { id: 3, owner: { id: 70 } },
            { name: 'n', vet: { id: 70 } },
          ],
          { insertMissing: true, noDelete: true },
        )
        .catch((err) => err);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toMatch(/cyclic/);
    });

    it('should not count the given key of a #ref row that its own place sets', async () => {
      // Pet 5 is given ownerId 2 but moves to person 1 in its own place, so the
      // #ref at person 2 only relates it and does not conflict with that stale key.
      await insertPersons(1, 2);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 5, ownerId: 2 }]);

      await Person.query().upsertGraph(
        [
          { id: 1, pets: [{ '#id': 'x', id: 5, ownerId: 2 }] },
          { id: 2, liked: [{ '#ref': 'x' }] },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet')).toMatchObject([{ id: 5, ownerId: 1 }]);
      expect(await knex('review_keys_liked')).toEqual([{ personId: 2, petId: 5 }]);
    });

    it('should not count the given key of a new #ref row that its own place sets', async () => {
      await insertPersons(1, 2);

      await Person.query().upsertGraph(
        [
          { id: 1, pets: [{ '#id': 'x', name: 'n', ownerId: 99 }] },
          { id: 2, favPet: { '#ref': 'x' } },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [pet] = await knex('review_keys_pet');
      expect(pet).toMatchObject({ name: 'n', ownerId: 1 });
      expect(await knex('review_keys_person').where('id', 2)).toMatchObject([{ favPetId: pet.id }]);
    });

    it.each([
      ['by default', {}],
      ['with noDelete', { noDelete: true }],
    ])(
      'should not fail on a key that one place changes and another reads, %s',
      async (_, options) => {
        // Person 2 gets a new code and pet 3 reads it through ownerByCode, so we
        // must not patch the person a second time by its old code.
        await insertPersons(2);
        await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 3, ownerCode: 'c2' }]);

        await Person.query().upsertGraph(
          { id: 2, code: 'c9', codePets: [{ id: 3, ownerByCode: { id: 2 } }] },
          options,
        );

        expect(await knex('review_keys_person')).toMatchObject([{ id: 2, code: 'c9' }]);
        expect(await knex('review_keys_pet')).toMatchObject([{ id: 3, ownerCode: 'c9' }]);
      },
    );

    it('should patch a row once when one place moves it and another only reads its key', async () => {
      // Pet 4 moves to person 1 in the second place and only reads its owner as
      // the parent of its siblings in the first, so we write it once.
      await insertPersons(1, 2);
      await insertRowsWithIds(knex, 'review_keys_pet', [
        { id: 1, ownerId: 1 },
        { id: 4, ownerId: 2 },
      ]);

      const updates = [];
      const onQuery = ({ sql, bindings }) => {
        if (/^update\b.*review_keys_pet/i.test(sql)) updates.push({ sql, bindings });
      };
      knex.on('query', onQuery);

      try {
        await Pet.query().upsertGraph(
          [
            { id: 4, siblings: [{}] },
            { id: 1, owner: { id: 1, pets: [{ id: 4 }] } },
          ],
          { relate: true, noDelete: true },
        );
      } finally {
        knex.removeListener('query', onQuery);
      }

      expect(updates.filter(({ bindings }) => bindings.includes(4))).toHaveLength(1);
      expect(await knex('review_keys_pet').where('id', 4)).toMatchObject([{ ownerId: 1 }]);
    });

    it('should relate an existing row by a key that a #ref{} gives', async () => {
      // The code of person 3 comes from person 2, so pet 4 is related by it.
      await insertPersons(2, 3);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 4 }]);

      await Person.query().upsertGraph(
        [
          { id: 3, code: '#ref{z.name}', codePets: [{ id: 4 }] },
          { id: 2, name: 'zz', '#id': 'z' },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').where('id', 4)).toMatchObject([{ ownerCode: 'zz' }]);
    });

    it('should let a #ref{} to a key that another node of its row sets wait for the new value', async () => {
      // Pet 1 moves to the new person np by a #ref node, and the name of the
      // new pet of person 3 reads its ownerId, so it waits for np, not null.
      await insertPersons(1, 3, 4);
      await insertRowsWithIds(knex, 'review_keys_pet', [
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
      ]);

      await Person.query().upsertGraph(
        [
          { name: 'np', pets: [{ '#ref': 'x' }] },
          { id: 4, favPet: { id: 1, '#id': 'x', siblings: [{ id: 2 }] } },
          { id: 3, favPet: { name: '#ref{x.ownerId}' } },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [np] = await knex('review_keys_person').where('name', 'np');
      expect(await knex('review_keys_pet').whereNotIn('id', [1, 2])).toMatchObject([
        { name: `${np.id}` },
      ]);
    });

    it('should let a #ref{} to the owner of a row with new siblings wait for the new owner', async () => {
      await insertPersons(1, 2, 4);
      await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 1, ownerId: 1 }]);

      await Person.query().upsertGraph(
        [
          { name: 'np', pets: [{ '#ref': 'x' }] },
          { id: 4, favPet: { id: 1, '#id': 'x', siblings: [{ name: 's' }] } },
          { id: 2, name: '#ref{x.ownerId}' },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [np] = await knex('review_keys_person').where('name', 'np');
      expect(await knex('review_keys_person').where('id', 2)).toMatchObject([{ name: `${np.id}` }]);
    });

    describe.each([
      ['in the order of the rows', false],
      ['in the reverse order of the rows', true],
    ])('a many-to-many #ref to a row that a later pass inserts, %s', (_, reverse) => {
      it('should relate the row at its own place and through the many-to-many', async () => {
        // Pet 9 moves to person 1, and its siblings are the pets of person 1, so
        // the new pet is only inserted in a later pass, after the #ref is seen.
        await insertPersons(1, 2, 3);
        await insertRowsWithIds(knex, 'review_keys_pet', [{ id: 9, ownerId: 2 }]);

        const graph = [
          {
            id: 1,
            pets: [{ id: 9, toys: [{ name: 't' }], siblings: [{ '#id': 'np', name: 'np' }] }],
          },
          { id: 3, liked: [{ '#ref': 'np' }] },
        ];

        await Person.query().upsertGraph(reverse ? graph.reverse() : graph, {
          relate: true,
          noDelete: true,
          allowRefs: true,
        });

        const [np] = await knex('review_keys_pet').where('name', 'np');
        expect(np).toMatchObject({ ownerId: 1 });
        expect(await knex('review_keys_liked')).toEqual([{ personId: 3, petId: np.id }]);
        expect(await knex('review_keys_pet').where('id', 9)).toMatchObject([{ ownerId: 1 }]);
      });
    });

    // The rows of the review probes: persons 1 to 4, person 2 has pet 3 as its
    // favourite, pets 1 and 2 belong to person 1, pet 3 to 2 and pet 4 to 3.
    const insertSeed = async () => {
      await insertPersons(1, 2, 3, 4);
      await knex('review_keys_person').where('id', 2).update({ favPetId: 3 });
      await insertRowsWithIds(knex, 'review_keys_pet', [
        { id: 1, ownerId: 1, vetId: 2 },
        { id: 2, ownerId: 1 },
        { id: 3, ownerId: 2, vetId: 3 },
        { id: 4, ownerId: 3 },
      ]);
      await knex('review_keys_liked').insert([
        { personId: 1, petId: 2 },
        { personId: 2, petId: 3 },
      ]);
    };

    it('should write the owner of a row that its uncovered many-to-many place gives', async () => {
      // Pet 1 is only kept in person 2's favPet (noUpdate), so the owner that
      // person 3's liked gives it is the one that counts.
      await insertSeed();

      await Person.query().upsertGraph(
        [
          { id: 2, favPet: { id: 1, '#id': 'x' } },
          { id: 3, liked: [{ '#ref': 'x', owner: { id: 4 } }] },
        ],
        { relate: true, noDelete: true, allowRefs: true, noUpdate: ['favPet'] },
      );

      expect(await knex('review_keys_pet').where('id', 1)).toMatchObject([{ ownerId: 4 }]);
    });

    it('should write the vet of a new row that an uncovered place gives', async () => {
      // Pet 1 is only kept in person 3's liked (noUpdate), so the new vet that
      // person 2's favPet gives it must not be orphaned.
      await insertSeed();

      await Person.query().upsertGraph(
        [
          { id: 3, liked: [{ id: 1, '#id': 'x' }] },
          { id: 2, favPet: { '#ref': 'x', name: 'q', vet: { name: 'nv' } } },
        ],
        { relate: true, noDelete: true, allowRefs: true, noUpdate: ['liked'] },
      );

      const [nv] = await knex('review_keys_person').where('name', 'nv');
      expect(await knex('review_keys_pet').where('id', 1)).toMatchObject([{ vetId: nv.id }]);
    });

    it('should write a #ref{} key of a row that its place lists twice', async () => {
      // Person 3's pets list pet 4 twice, once with a #ref{} to person 2, which
      // wins over the key of that place in either order.
      await insertSeed();

      for (const pets of [
        [{ id: 4, ownerId: '#ref{k.id}' }, { id: 4 }],
        [{ id: 4 }, { id: 4, ownerId: '#ref{k.id}' }],
      ]) {
        await knex('review_keys_pet').where('id', 4).update({ ownerId: 3 });
        await Person.query().upsertGraph(
          [
            { id: 2, '#id': 'k' },
            { id: 3, pets },
          ],
          {
            relate: true,
            noDelete: true,
            allowRefs: true,
          },
        );

        expect(await knex('review_keys_pet').where('id', 4)).toMatchObject([{ ownerId: 2 }]);
      }
    });

    it('should write a #ref{} key of a row that a parent row listed twice gives', async () => {
      // Person 3 is listed twice, so both listings of pet 4 are at the same place,
      // and the #ref{} wins there.
      await insertSeed();

      await Person.query().upsertGraph(
        [
          { id: 2, '#id': 'k' },
          { id: 3, pets: [{ id: 4, ownerId: '#ref{k.id}' }] },
          { id: 3, pets: [{ id: 4 }] },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').where('id', 4)).toMatchObject([{ ownerId: 2 }]);
    });

    it('should insert a row with its #ref{} key when its place lists it again by #ref', async () => {
      // The #ref to pet p at the same place doesn't override p's #ref{} key.
      await insertSeed();

      await Person.query().upsertGraph(
        [
          { id: 2, '#id': 'k' },
          { id: 3, pets: [{ '#id': 'x', name: 'p', ownerId: '#ref{k.id}' }, { '#ref': 'x' }] },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').where('name', 'p')).toMatchObject([{ ownerId: 2 }]);
    });

    it('should update a row once that is kept in several places with siblings in only one', async () => {
      // Pet 1's #ref place in person 4's pets writes its owner, so its place in
      // liked only reads it and doesn't write the row a second time.
      await insertSeed();
      const updates = [];
      const onQuery = ({ sql, bindings }) => {
        if (/^update\b.*review_keys_pet/i.test(sql)) updates.push(bindings);
      };
      knex.on('query', onQuery);

      try {
        await Person.query().upsertGraph(
          [
            { id: 4, pets: [{ '#ref': 'x' }] },
            { id: 3, liked: [{ id: 1, '#id': 'x', siblings: [{ id: 2 }] }] },
          ],
          { relate: true, noDelete: true, allowRefs: true },
        );
      } finally {
        knex.removeListener('query', onQuery);
      }

      expect(updates.filter((bindings) => bindings.includes(1))).toHaveLength(1);
    });

    it('should give a row that an insert reaches twice the key of its first place', async () => {
      await Person.query().upsertGraph(
        [
          {
            '#id': 'k',
            name: 'k',
            pets: [{ '#id': 'x', name: 'p', ownerId: '#ref{k.id}' }, { '#ref': 'x' }],
          },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      const [k] = await knex('review_keys_person').where('name', 'k');
      expect(await knex('review_keys_pet').where('name', 'p')).toMatchObject([{ ownerId: k.id }]);
    });

    it('should not move the row whose siblings name a row twice', async () => {
      await insertSeed();

      await Pet.query().upsertGraph(
        [
          { id: 2, siblings: [{ id: 4, ownerId: '#ref{k.id}' }, { id: 4 }] },
          { id: 3, owner: { id: 3, '#id': 'k' } },
        ],
        { relate: true, noDelete: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').where('id', 2)).toMatchObject([{ ownerId: 1 }]);
    });

    it('should keep the owner of a row whose sibling is moved by a #ref{} while unrelating', async () => {
      await insertSeed();

      await Person.query().upsertGraph(
        [
          {
            id: 3,
            '#id': 'k',
            favPet: { id: 2, siblings: [{ id: 4, ownerId: '#ref{k.id}' }] },
          },
        ],
        { relate: true, unrelate: true, allowRefs: true },
      );

      expect(await knex('review_keys_pet').where('id', 2)).toMatchObject([{ ownerId: 1 }]);
    });
  });
};
