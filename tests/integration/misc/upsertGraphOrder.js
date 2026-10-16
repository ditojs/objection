import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model, UniqueViolationError } from 'objection';

export default (session) => {
  describe('upsertGraph() order of the writes (#214)', () => {
    const { knex } = session;

    class Node extends Model {
      static get tableName() {
        return 'graph_order_node';
      }

      static get relationMappings() {
        return {
          children: {
            relation: Model.HasManyRelation,
            modelClass: Node,
            join: { from: 'graph_order_node.id', to: 'graph_order_node.parentId' },
          },
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Node,
            join: { from: 'graph_order_node.parentId', to: 'graph_order_node.id' },
          },
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'graph_order_pet';
      }

      // Tests delay the updates of these rows, so that writes that run
      // concurrently would run out of order:
      static delayedIds = [];

      async $beforeUpdate() {
        if (Pet.delayedIds.includes(this.id)) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_order_pet.ownerId', to: 'graph_order_person.id' },
          },
          siblings: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_order_pet.ownerId', to: 'graph_order_pet.ownerId' },
          },
          sibling: {
            relation: Model.HasOneRelation,
            modelClass: Pet,
            join: { from: 'graph_order_pet.ownerId', to: 'graph_order_pet.ownerId' },
          },
          fans: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'graph_order_pet.id', to: 'graph_order_person.favoritePetId' },
          },
        };
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'graph_order_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_order_person.id', to: 'graph_order_pet.ownerId' },
          },
          petsNamedA: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            filter: (query) => query.where('name', 'a'),
            join: { from: 'graph_order_person.id', to: 'graph_order_pet.ownerId' },
          },
          onePet: {
            relation: Model.HasOneRelation,
            modelClass: Pet,
            join: { from: 'graph_order_person.id', to: 'graph_order_pet.ownerId' },
          },
          favoritePet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: { from: 'graph_order_person.favoritePetId', to: 'graph_order_pet.id' },
          },
          likedPets: {
            relation: Model.ManyToManyRelation,
            modelClass: Pet,
            join: {
              from: 'graph_order_person.id',
              through: { from: 'graph_order_like.personId', to: 'graph_order_like.petId' },
              to: 'graph_order_pet.id',
            },
          },
        };
      }
    }

    class Org extends Model {
      static get tableName() {
        return 'graph_order_org';
      }

      static get relationMappings() {
        return {
          people: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'graph_order_org.id', to: 'graph_order_person.orgId' },
          },
        };
      }
    }

    const tableNames = [
      'graph_order_like',
      'graph_order_node',
      'graph_order_pet',
      'graph_order_person',
      'graph_order_org',
    ];

    function dropTables() {
      return tableNames.reduce((schema, name) => schema.dropTableIfExists(name), knex.schema);
    }

    // `nodeOnDelete` is the action of the tree's foreign key, null for none.
    async function createTables({
      nodeOnDelete = null,
      uniqueOwner = false,
      uniqueName = false,
      requiredOwner = false,
    } = {}) {
      await dropTables();
      await knex.schema
        .createTable('graph_order_node', (table) => {
          table.integer('id').primary();
          const parentId = table.integer('parentId').references('graph_order_node.id');
          if (nodeOnDelete) {
            parentId.onDelete(nodeOnDelete);
          }
        })
        .createTable('graph_order_org', (table) => {
          table.integer('id').primary();
        })
        .createTable('graph_order_person', (table) => {
          table.integer('id').primary();
          table.integer('orgId').references('graph_order_org.id').onDelete('CASCADE');
          table.integer('favoritePetId');
        })
        .createTable('graph_order_like', (table) => {
          table.integer('personId');
          table.integer('petId');
        })
        .createTable('graph_order_pet', (table) => {
          table.integer('id').primary();
          table.string('name');
          const ownerId = table
            .integer('ownerId')
            .references('graph_order_person.id')
            .onDelete('CASCADE');
          if (requiredOwner) {
            ownerId.notNullable();
          }
          if (uniqueOwner) {
            table.unique(['ownerId']);
          }
          if (uniqueName) {
            table.unique(['ownerId', 'name']);
          }
        });
    }

    async function insertPeople(pets) {
      await knex('graph_order_org').insert({ id: 1 });
      await knex('graph_order_person').insert([
        { id: 1, orgId: 1 },
        { id: 2, orgId: 1 },
      ]);
      await knex('graph_order_pet').insert(pets);
    }

    function selectNodes() {
      return knex('graph_order_node').orderBy('id');
    }

    function selectPets() {
      return knex('graph_order_pet').orderBy('id');
    }

    beforeAll(() => {
      for (const modelClass of [Node, Pet, Person, Org]) {
        modelClass.knex(knex);
      }
    });

    afterAll(dropTables);

    // SQL Server rejects cascading actions on self-references.
    for (const onDelete of [null, 'CASCADE', 'SET NULL']) {
      describe(`tree with ${onDelete ?? 'no action'} on delete`, () => {
        const itTree = it.skipIf(onDelete && session.isMsSql());

        itTree('should keep a row that moves up from below a deleted row', async () => {
          await createTables({ nodeOnDelete: onDelete });
          await knex('graph_order_node').insert([
            { id: 1, parentId: null },
            { id: 2, parentId: 1 },
            { id: 3, parentId: 2 },
          ]);

          await Node.query().upsertGraph({ id: 1, children: [{ id: 3 }] }, { relate: true });

          expect(await selectNodes()).toEqual([
            { id: 1, parentId: null },
            { id: 3, parentId: 1 },
          ]);
        });

        itTree('should keep a row that moves to a sibling of its deleted parent', async () => {
          await createTables({ nodeOnDelete: onDelete });
          await knex('graph_order_node').insert([
            { id: 1, parentId: null },
            { id: 2, parentId: 1 },
            { id: 3, parentId: 2 },
            { id: 4, parentId: 1 },
          ]);

          await Node.query().upsertGraph(
            { id: 1, children: [{ id: 4, children: [{ id: 3 }] }] },
            { relate: true },
          );

          expect(await selectNodes()).toEqual([
            { id: 1, parentId: null },
            { id: 3, parentId: 4 },
            { id: 4, parentId: 1 },
          ]);
        });
      });
    }

    it('should keep a row that moves out of a deleted branch of another table', async () => {
      await createTables();
      await insertPeople([
        { id: 1, name: 'a', ownerId: 1 },
        { id: 2, name: 'b', ownerId: 2 },
      ]);

      await Org.query().upsertGraph(
        { id: 1, people: [{ id: 1, pets: [{ id: 1 }, { id: 2 }] }] },
        { relate: true },
      );

      expect(await knex('graph_order_person')).toEqual([{ id: 1, orgId: 1, favoritePetId: null }]);
      expect(await selectPets()).toEqual([
        { id: 1, name: 'a', ownerId: 1 },
        { id: 2, name: 'b', ownerId: 1 },
      ]);
    });

    it('should keep a row that moves into an empty HasOneRelation from a deleted branch', async () => {
      await createTables();
      await insertPeople([{ id: 2, name: 'b', ownerId: 2 }]);

      await Org.query().upsertGraph(
        { id: 1, people: [{ id: 1, onePet: { id: 2 } }] },
        { relate: true },
      );

      expect(await selectPets()).toEqual([{ id: 2, name: 'b', ownerId: 1 }]);
    });

    // The ids of `#ref` models may come from the inserts, so they're related after.
    it('should relate #ref models after the inserts', async () => {
      await createTables();
      await knex('graph_order_person').insert({ id: 1 });

      await Person.query().upsertGraph(
        { id: 1, favoritePet: { '#id': 'x', id: 3, name: 'c' }, pets: [{ '#ref': 'x' }] },
        { relate: true, insertMissing: true, allowRefs: true },
      );

      expect(await knex('graph_order_person')).toEqual([{ id: 1, orgId: null, favoritePetId: 3 }]);
      expect(await selectPets().select('id', 'name')).toEqual([{ id: 3, name: 'c' }]);
    });

    it('should give #ref models related into a HasManyRelation their foreign key (#311)', async () => {
      await createTables();
      await knex('graph_order_person').insert({ id: 1 });

      await Person.query().upsertGraph(
        { id: 1, favoritePet: { '#id': 'x', id: 3, name: 'c' }, pets: [{ '#ref': 'x' }] },
        { relate: true, insertMissing: true, allowRefs: true },
      );

      expect(await selectPets()).toEqual([{ id: 3, name: 'c', ownerId: 1 }]);
    });

    describe('rows that move with the relation back to their new owner', () => {
      it('should keep the old owner of a row moved into a HasManyRelation', async () => {
        for (const relate of [true, ['pets']]) {
          await createTables();
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
          ]);

          await Person.query().upsertGraph(
            { id: 1, pets: [{ id: 1 }, { id: 2, owner: { id: 1, orgId: null } }] },
            { relate },
          );

          expect(await knex('graph_order_person').orderBy('id')).toEqual([
            { id: 1, orgId: null, favoritePetId: null },
            { id: 2, orgId: 1, favoritePetId: null },
          ]);
          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 1 },
          ]);
        }
      });

      it('should upsert the relations that the graph gives the new owner there', async () => {
        for (const relate of [true, ['pets']]) {
          await createTables();
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
          ]);
          await knex('graph_order_person').where('id', 1).update({ favoritePetId: 1 });
          await knex('graph_order_like').insert({ personId: 1, petId: 1 });

          await Person.query().upsertGraph(
            {
              id: 1,
              pets: [
                { id: 1 },
                { id: 2, owner: { id: 1, favoritePet: { id: 1 }, likedPets: [{ id: 1 }] } },
              ],
            },
            { relate },
          );

          expect(await knex('graph_order_person').orderBy('id')).toEqual([
            { id: 1, orgId: 1, favoritePetId: 1 },
            { id: 2, orgId: 1, favoritePetId: null },
          ]);
          expect(await knex('graph_order_like')).toEqual([{ personId: 1, petId: 1 }]);
          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 1 },
          ]);
        }
      });

      it('should find the moved row below its new owner there', async () => {
        for (const relate of [true, ['pets']]) {
          await createTables();
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
          ]);

          await Person.query().upsertGraph(
            {
              id: 1,
              pets: [
                { id: 1 },
                { id: 2, owner: { id: 1, pets: [{ id: 1 }, { id: 2, name: 'c' }] } },
              ],
            },
            { relate },
          );

          expect(await knex('graph_order_person').orderBy('id').pluck('id')).toEqual([1, 2]);
          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'c', ownerId: 1 },
          ]);
        }
      });

      it('should keep a row that the graph relates below a moved row', async () => {
        await createTables();
        await knex('graph_order_node').insert([
          { id: 1, parentId: null },
          { id: 2, parentId: null },
          { id: 3, parentId: 1 },
          { id: 4, parentId: 1 },
          { id: 5, parentId: 2 },
        ]);

        await Node.query().upsertGraph(
          { id: 1, children: [{ id: 5, children: [{ id: 3 }] }] },
          { relate: true },
        );

        expect(await selectNodes()).toEqual([
          { id: 1, parentId: null },
          { id: 2, parentId: null },
          { id: 3, parentId: 5 },
          { id: 5, parentId: 1 },
        ]);
      });

      it('should keep a row below a moved row that the graph keeps elsewhere', async () => {
        await createTables();
        await knex('graph_order_node').insert([
          { id: 1, parentId: null },
          { id: 4, parentId: 1 },
        ]);

        await Node.query().upsertGraph(
          [{ id: 4 }, { id: 9, children: [{ id: 1, children: [] }] }],
          { relate: true, insertMissing: true },
        );

        expect(await selectNodes()).toEqual([
          { id: 1, parentId: 9 },
          { id: 4, parentId: null },
          { id: 9, parentId: null },
        ]);
      });

      it('should keep the old owner of a row moved into a HasOneRelation', async () => {
        await createTables();
        await insertPeople([{ id: 2, name: 'b', ownerId: 2 }]);

        await Person.query().upsertGraph(
          { id: 1, onePet: { id: 2, owner: { id: 1 } } },
          { relate: true },
        );

        expect(await knex('graph_order_person').orderBy('id').pluck('id')).toEqual([1, 2]);
        expect(await selectPets()).toEqual([{ id: 2, name: 'b', ownerId: 1 }]);
      });

      it('should keep the old parent of a row moved in a tree', async () => {
        await createTables();
        await knex('graph_order_node').insert([
          { id: 1, parentId: null },
          { id: 2, parentId: null },
          { id: 3, parentId: 2 },
        ]);

        await Node.query().upsertGraph(
          { id: 1, children: [{ id: 3, parent: { id: 1 } }] },
          { relate: true },
        );

        expect(await selectNodes()).toEqual([
          { id: 1, parentId: null },
          { id: 2, parentId: null },
          { id: 3, parentId: 1 },
        ]);
      });
    });

    it('should unrelate the rows of each owner without the rows moved between them', async () => {
      await createTables();
      await insertPeople([
        { id: 1, name: 'a', ownerId: 1 },
        { id: 2, name: 'b', ownerId: 2 },
      ]);

      // Pet 1 moves from person 1 to 2 through another relation:
      await Person.query().upsertGraph(
        [
          { id: 1, pets: [] },
          { id: 2, pets: [], petsNamedA: [{ id: 1 }] },
        ],
        { relate: true, unrelate: true },
      );

      expect(await selectPets()).toEqual([
        { id: 1, name: 'a', ownerId: 2 },
        { id: 2, name: 'b', ownerId: null },
      ]);
    });

    it('should not unrelate a row that moves between owners with the unrelate option', async () => {
      await createTables();
      await insertPeople([
        { id: 1, name: 'a', ownerId: 1 },
        { id: 2, name: 'b', ownerId: 2 },
      ]);

      await Person.query().upsertGraph(
        [
          { id: 1, pets: [{ id: 2 }] },
          { id: 2, pets: [] },
        ],
        { relate: true, unrelate: true },
      );

      expect(await selectPets()).toEqual([
        { id: 1, name: 'a', ownerId: null },
        { id: 2, name: 'b', ownerId: 1 },
      ]);
    });

    // Pet 4 lists no siblings, which leaves both pets out of its siblings, but
    // the pets of person 2 keep them through the same key column:
    it('should keep the rows that another relation on the same key leaves out', async () => {
      await createTables();
      await insertPeople([
        { id: 3, name: 'c', ownerId: 2 },
        { id: 4, name: 'd', ownerId: 2 },
      ]);

      await Person.query().upsertGraph({ id: 2, pets: [{ id: 3 }, { id: 4, siblings: [] }] });

      expect(await selectPets()).toEqual([
        { id: 3, name: 'c', ownerId: 2 },
        { id: 4, name: 'd', ownerId: 2 },
      ]);
    });

    describe('rows that read keys that the graph fills in', () => {
      // Person 3 likes pet 10, which belongs to person 1. Pet 11 belongs to
      // person 3.
      beforeEach(async () => {
        await createTables();
        await knex('graph_order_org').insert({ id: 1 });
        await knex('graph_order_person').insert([
          { id: 1, orgId: 1 },
          { id: 2, orgId: 1 },
          { id: 3, orgId: 1, favoritePetId: 10 },
        ]);
        await knex('graph_order_pet').insert([
          { id: 10, name: 'a', ownerId: 1 },
          { id: 11, name: 'b', ownerId: 3 },
        ]);
      });

      // The siblings move first with the key of the owner of pet 10, before
      // the removed fan and replaced owner cascade to their pets:
      for (const ownerId of [1, 2]) {
        it(`should move siblings first with the key of the owner ${ownerId === 1 ? 'that pet 10 keeps' : 'that replaces the owner of pet 10'}`, async () => {
          await Pet.query().upsertGraph(
            { id: 10, owner: { id: ownerId }, fans: [], siblings: [{ id: 10 }, { id: 11 }] },
            { relate: true },
          );

          expect((await selectPets()).map(({ id, ownerId }) => ({ id, ownerId }))).toEqual([
            { id: 10, ownerId },
            { id: 11, ownerId },
          ]);
        });
      }

      it('should resolve a #ref{} to a key that the graph fills in before moving', async () => {
        await Person.query().upsertGraph(
          [
            { id: 3, favoritePet: { id: 10, '#id': 'p', owner: { id: 2 } } },
            { id: 1, pets: [{ id: 11, name: '#ref{p.ownerId}' }] },
          ],
          { relate: true, noDelete: true, allowRefs: true },
        );

        expect(await selectPets()).toEqual([
          { id: 10, name: 'a', ownerId: 2 },
          { id: 11, name: session.numberAsText(2), ownerId: 1 },
        ]);
      });
    });

    describe('rows that several places keep', () => {
      it('should keep a row that one of its places keeps through the same key', async () => {
        for (const reversed of [false, true]) {
          await createTables();
          await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

          // Pet 1 leaves itself out of its siblings, person 1's pets keep it
          // through the same key, and person 2's liked pets through another:
          const people = [
            { id: 1, pets: [{ id: 1, siblings: [] }] },
            { id: 2, likedPets: [{ id: 1 }] },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
          });

          expect(await selectPets()).toEqual([{ id: 1, name: 'a', ownerId: 1 }]);
        }
      });
    });

    describe('unique foreign key of a HasOneRelation', () => {
      it('should delete the current row before inserting its replacement', async () => {
        await createTables({ uniqueOwner: true });
        await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

        await Person.query().upsertGraph(
          { id: 1, onePet: { id: 3, name: 'c' } },
          { insertMissing: true },
        );

        expect(await selectPets()).toEqual([{ id: 3, name: 'c', ownerId: 1 }]);
      });

      it('should delete the current row before relating its replacement', async () => {
        await createTables({ uniqueOwner: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
        ]);

        await Person.query().upsertGraph({ id: 1, onePet: { id: 2 } }, { relate: true });

        expect(await selectPets()).toEqual([{ id: 2, name: 'b', ownerId: 1 }]);
      });

      it('should move the current row to another owner before relating its replacement', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: null },
          ]);

          // Pet 1 moves from person 1 to 2, and pet 2 into its slot:
          const people = [
            { id: 1, onePet: { id: 2 } },
            { id: 2, onePet: { id: 1 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 2 },
            { id: 2, name: 'b', ownerId: 1 },
          ]);
        }
      });

      it('should insert a row into a slot after its current row moves, next to a BelongsToOne relate of it', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

          // Pet 1 moves to the new person 3, the new pet 3 into its slot, and
          // person 1 relates pet 1 as its favorite, which doesn't move it:
          const people = [
            { id: 1, favoritePet: { id: 1 } },
            { id: 1, onePet: { id: 3, name: 'c' } },
            { id: 3, onePet: { id: 1 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
            insertMissing: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 3 },
            { id: 3, name: 'c', ownerId: 1 },
          ]);
        }
      });

      it('should insert a row into a slot whose current row moves through its own BelongsToOneRelation', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

          // Pet 1 names person 2 as its owner, and the new pet 3 goes into its
          // slot, so pet 1 leaves it first:
          const relations = [
            ['onePet', { id: 3, name: 'c' }],
            ['favoritePet', { id: 1, owner: { id: 2 } }],
          ];
          await Person.query().upsertGraph(
            { id: 1, ...Object.fromEntries(reversed ? relations.reverse() : relations) },
            { relate: true, insertMissing: true },
          );

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 2 },
            { id: 3, name: 'c', ownerId: 1 },
          ]);
        }
      });

      it('should relate a row into a slot after its current row moves into a slot that a delete frees', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
            { id: 3, name: 'c', ownerId: null },
          ]);

          // Pet 2 is deleted, pet 1 moves into its slot, and pet 3 into pet 1's:
          const people = [
            { id: 1, onePet: { id: 3 } },
            { id: 2, onePet: { id: 1 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 2 },
            { id: 3, name: 'c', ownerId: 1 },
          ]);
        }
      });

      it('should relate a row into a slot after its current row moves to a new owner', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: null },
          ]);

          // Pet 1 moves to the new person 3, and pet 2 into its slot:
          const people = [
            { id: 1, onePet: { id: 2 } },
            { id: 3, onePet: { id: 1 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
            insertMissing: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 3 },
            { id: 2, name: 'b', ownerId: 1 },
          ]);
        }
      });

      it('should insert a row into a slot after its current row moves to a new owner', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

          // Pet 1 moves to the new person 3, and the new pet 3 into its slot:
          const people = [
            { id: 1, onePet: { id: 3, name: 'c' } },
            { id: 3, onePet: { id: 1 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
            insertMissing: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 3 },
            { id: 3, name: 'c', ownerId: 1 },
          ]);
        }
      });

      it('should insert a row into a slot after a chain of rows moves to a new owner', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
          ]);

          // Pet 2 moves to the new person 3, pet 1 into its slot, and the new
          // pet 3 into pet 1's:
          const people = [
            { id: 1, onePet: { id: 3, name: 'c' } },
            { id: 2, onePet: { id: 1 } },
            { id: 3, onePet: { id: 2 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
            insertMissing: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 2 },
            { id: 2, name: 'b', ownerId: 3 },
            { id: 3, name: 'c', ownerId: 1 },
          ]);
        }
      });

      it('should relate a #ref into a slot after its current row moves to a new owner', async () => {
        await createTables({ uniqueOwner: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: null },
        ]);
        Pet.delayedIds = [1];

        try {
          // Pet 1 moves to the new person 3, and pet 2 into its slot:
          await Person.query().upsertGraph(
            [
              { id: 1, onePet: { '#ref': 'b' } },
              { id: 3, onePet: { id: 1 } },
              { id: 2, likedPets: [{ '#id': 'b', id: 2 }] },
            ],
            { relate: true, insertMissing: true, allowRefs: true },
          );
        } finally {
          Pet.delayedIds = [];
        }

        expect(await selectPets()).toEqual([
          { id: 1, name: 'a', ownerId: 3 },
          { id: 2, name: 'b', ownerId: 1 },
        ]);
      });

      // Rows that move out of a slot below a row that moves to another owner
      // leave it before the rows that go into it (#398):
      it('should write the rows of a slot whose row moves below a moved row', async () => {
        for (const [people1, people2, expectedPets] of [
          // The new pet 3 goes into the slot of person 1, and pet 1 moves to
          // person 2, which moves to org 2 first:
          [
            [{ id: 1, onePet: { id: 3, name: 'c' } }],
            [{ id: 2, onePet: { id: 1 } }],
            [
              { id: 1, ownerId: 2 },
              { id: 3, ownerId: 1 },
            ],
          ],
          // The same, and pet 2 moves from person 2 to the new person 3:
          [
            [{ id: 1, onePet: { id: 3, name: 'c' } }],
            [
              { id: 2, onePet: { id: 1 } },
              { id: 3, onePet: { id: 2 } },
            ],
            [
              { id: 1, ownerId: 2 },
              { id: 2, ownerId: 3 },
              { id: 3, ownerId: 1 },
            ],
          ],
        ]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
          ]);
          await knex('graph_order_org').insert({ id: 2 });

          await Org.query().upsertGraph(
            [
              { id: 1, people: people1 },
              { id: 2, people: people2 },
            ],
            { relate: true, insertMissing: true },
          );

          const pets = await knex('graph_order_pet').select('id', 'ownerId').orderBy('id');
          expect(pets.filter((pet) => pet.ownerId !== null)).toEqual(expectedPets);
        }
      });

      // Under `unrelate`, one of the rows leaves its slot first, as its key may
      // be null (#489):
      it('should swap the rows of two slots with unrelate', async () => {
        await createTables({ uniqueOwner: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
        ]);
        await knex('graph_order_org').insert({ id: 2 });

        await Org.query().upsertGraph(
          [
            { id: 1, people: [{ id: 1, onePet: { id: 2 } }] },
            { id: 2, people: [{ id: 2, onePet: { id: 1 } }] },
          ],
          { relate: true, unrelate: true },
        );

        expect(await selectPets()).toEqual([
          { id: 1, name: 'a', ownerId: 2 },
          { id: 2, name: 'b', ownerId: 1 },
        ]);
      });

      // Pet 2 waits for the insert of person 3, which its name reads, so it is
      // related after the inserts, and pet 1 leaves its slot right before it:
      it('should swap the rows of two slots when one waits for an insert', async () => {
        for (const uniqueOwner of [true, false]) {
          await createTables({ uniqueOwner });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
          ]);
          await knex('graph_order_org').insert({ id: 2 });

          await Org.query().upsertGraph(
            [
              {
                id: 1,
                people: [
                  { id: 1, onePet: { id: 2, name: '#ref{n.id}' } },
                  { '#id': 'n', id: 3 },
                ],
              },
              { id: 2, people: [{ id: 2, onePet: { id: 1 } }] },
            ],
            { relate: true, unrelate: true, insertMissing: true, allowRefs: true },
          );

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 2 },
            { id: 2, name: session.numberAsText(3), ownerId: 1 },
          ]);
        }
      });

      // The key is cleared without validation, so a schema that doesn't allow
      // null in it doesn't fail:
      it('should swap the rows of two slots whose keys the schema requires', async () => {
        class TypedPet extends Pet {
          static get jsonSchema() {
            return {
              type: 'object',
              properties: { id: { type: 'integer' }, ownerId: { type: 'integer' } },
            };
          }
        }

        class TypedPerson extends Person {
          static get relationMappings() {
            return {
              onePet: {
                relation: Model.HasOneRelation,
                modelClass: TypedPet,
                join: { from: 'graph_order_person.id', to: 'graph_order_pet.ownerId' },
              },
            };
          }
        }

        await createTables({ uniqueOwner: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
        ]);

        await TypedPerson.query().upsertGraph(
          [
            { id: 1, onePet: { id: 2 } },
            { id: 2, onePet: { id: 1 } },
          ],
          { relate: true, unrelate: true },
        );

        expect(await selectPets()).toEqual([
          { id: 1, name: 'a', ownerId: 2 },
          { id: 2, name: 'b', ownerId: 1 },
        ]);
      });

      // A known limit: without `unrelate`, the rows aren't unrelated, so they
      // can't leave their slots first.
      it('should fail to swap the rows of two slots without unrelate', async () => {
        await createTables({ uniqueOwner: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
        ]);
        await knex('graph_order_org').insert({ id: 2 });

        await expect(
          Org.query().upsertGraph(
            [
              { id: 1, people: [{ id: 1, onePet: { id: 2 } }] },
              { id: 2, people: [{ id: 2, onePet: { id: 1 } }] },
            ],
            { relate: true },
          ),
        ).rejects.toThrow(UniqueViolationError);
      });

      // Keys that can't be null are swapped directly, which works where they
      // aren't unique:
      it('should swap the rows of two slots with required keys with unrelate', async () => {
        await createTables({ requiredOwner: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
        ]);
        await knex('graph_order_org').insert({ id: 2 });

        await Org.query().upsertGraph(
          [
            { id: 1, people: [{ id: 1, onePet: { id: 2 } }] },
            { id: 2, people: [{ id: 2, onePet: { id: 1 } }] },
          ],
          { relate: true, unrelate: true },
        );

        expect(await selectPets()).toEqual([
          { id: 1, name: 'a', ownerId: 2 },
          { id: 2, name: 'b', ownerId: 1 },
        ]);
      });

      // Pet 1 is the current row of its own `sibling` slot, which it leaves for
      // the new pet:
      it('should replace a row in its own slot', async () => {
        await createTables({ uniqueOwner: true });
        await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

        await Pet.query().upsertGraph(
          { id: 1, sibling: { id: 2, name: 'n' } },
          { unrelate: true, insertMissing: true },
        );

        expect(await selectPets()).toEqual([
          { id: 1, name: 'a', ownerId: null },
          { id: 2, name: 'n', ownerId: 1 },
        ]);
      });

      it('should keep a row in an emptied slot that the relations of a moved row move', async () => {
        await createTables({ uniqueOwner: true, requiredOwner: true });
        await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);
        await knex('graph_order_org').insert({ id: 2 });

        // Pet 1 moves to person 2, which moves to org 2 first, and nothing goes
        // into its slot, so it isn't unrelated, which its key doesn't allow:
        await Org.query().upsertGraph(
          [
            { id: 1, people: [{ id: 1, onePet: null }] },
            { id: 2, people: [{ id: 2, onePet: { id: 1 } }] },
          ],
          { relate: true },
        );

        expect(await selectPets()).toEqual([{ id: 1, name: 'a', ownerId: 2 }]);
      });

      it('should move a chain of rows between the slots of owners', async () => {
        for (const reversed of [false, true]) {
          await createTables({ uniqueOwner: true });
          await insertPeople([
            { id: 1, name: 'a', ownerId: 1 },
            { id: 2, name: 'b', ownerId: 2 },
            { id: 3, name: 'c', ownerId: null },
          ]);
          await knex('graph_order_person').insert({ id: 3, orgId: 1 });

          // Pet 2 moves from person 2 to 3, pet 1 from person 1 to 2, and pet 3
          // into the slot of person 1:
          const people = [
            { id: 1, onePet: { id: 3 } },
            { id: 2, onePet: { id: 1 } },
            { id: 3, onePet: { id: 2 } },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
          });

          expect(await selectPets()).toEqual([
            { id: 1, name: 'a', ownerId: 2 },
            { id: 2, name: 'b', ownerId: 3 },
            { id: 3, name: 'c', ownerId: 1 },
          ]);
        }
      });
    });

    // A row that moves out of the slot that a new row goes into, below that
    // new row, can't move first. Without a unique key, both are written:
    it('should insert a row into a slot that its current row moves out of below it', async () => {
      await createTables();
      await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

      await Person.query().upsertGraph(
        { id: 1, onePet: { id: 3, name: 'c', fans: [{ id: 3, onePet: { id: 1 } }] } },
        { relate: true, insertMissing: true },
      );

      expect(await selectPets()).toEqual([
        { id: 1, name: 'a', ownerId: 3 },
        { id: 3, name: 'c', ownerId: 1 },
      ]);
      expect(await knex('graph_order_person').where('id', 3).first()).toMatchObject({
        favoritePetId: 3,
      });
    });

    describe('unique key with the foreign key of a HasManyRelation', () => {
      it('should delete a row before inserting a row with its key', async () => {
        await createTables({ uniqueName: true });
        await insertPeople([{ id: 1, name: 'a', ownerId: 1 }]);

        await Person.query().upsertGraph(
          { id: 1, pets: [{ id: 3, name: 'a' }] },
          { insertMissing: true },
        );

        expect(await selectPets()).toEqual([{ id: 3, name: 'a', ownerId: 1 }]);
      });

      it('should delete a row before patching a kept row to its key', async () => {
        await createTables({ uniqueName: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 3, name: 'c', ownerId: 1 },
        ]);

        await Person.query().upsertGraph({ id: 1, pets: [{ id: 3, name: 'a' }] });

        expect(await selectPets()).toEqual([{ id: 3, name: 'a', ownerId: 1 }]);
      });

      // Relates to existing owners run before the deletes, and objection
      // doesn't know the unique keys to order them otherwise.
      it('should fail to relate a row with the key of a row that it deletes', async () => {
        await createTables({ uniqueName: true });
        await insertPeople([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
          { id: 3, name: 'b', ownerId: 1 },
        ]);

        await expect(
          Person.query().upsertGraph({ id: 1, pets: [{ id: 1 }, { id: 2 }] }, { relate: true }),
        ).rejects.toThrow(UniqueViolationError);

        expect(await selectPets()).toEqual([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 2 },
          { id: 3, name: 'b', ownerId: 1 },
        ]);
      });
    });
  });
};
