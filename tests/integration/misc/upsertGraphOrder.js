import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'graph_order_pet';
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
        .createTable('graph_order_pet', (table) => {
          table.integer('id').primary();
          table.string('name');
          table.integer('ownerId').references('graph_order_person.id').onDelete('CASCADE');
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
