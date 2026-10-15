import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model, NotFoundError, UniqueViolationError, ValidationError } from 'objection';
import { insertRowsWithIds } from '../../../testUtils/testUtils.js';

// How upsertGraph() writes rows that it moves to other owners, and the rows
// around them, also where that fails today as documented.
export default (session) => {
  describe('upsertGraph() moving rows', () => {
    describe('rows of HasManyRelations', () => {
      const { knex } = session;

      class Category extends Model {
        static get tableName() {
          return 'graph_move_category';
        }
      }

      class Badge extends Model {
        static get tableName() {
          return 'graph_move_badge';
        }
      }

      class Toy extends Model {
        static get tableName() {
          return 'graph_move_toy';
        }
      }

      class Pet extends Model {
        static get tableName() {
          return 'graph_move_pet';
        }

        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Person,
              join: { from: 'graph_move_pet.ownerId', to: 'graph_move_person.id' },
            },
            siblings: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: { from: 'graph_move_pet.ownerId', to: 'graph_move_pet.ownerId' },
            },
            ownerFriends: {
              relation: Model.ManyToManyRelation,
              modelClass: Person,
              join: {
                from: 'graph_move_pet.ownerId',
                through: {
                  from: 'graph_move_friendship.personId',
                  to: 'graph_move_friendship.friendId',
                },
                to: 'graph_move_person.id',
              },
            },
            toys: {
              relation: Model.HasManyRelation,
              modelClass: Toy,
              join: { from: 'graph_move_pet.id', to: 'graph_move_toy.petId' },
            },
            category: {
              relation: Model.BelongsToOneRelation,
              modelClass: Category,
              join: { from: 'graph_move_pet.categoryId', to: 'graph_move_category.id' },
            },
          };
        }
      }

      class Person extends Model {
        static get tableName() {
          return 'graph_move_person';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: { from: 'graph_move_person.id', to: 'graph_move_pet.ownerId' },
            },
            children: {
              relation: Model.HasManyRelation,
              modelClass: Person,
              join: { from: 'graph_move_person.id', to: 'graph_move_person.parentId' },
            },
            parent: {
              relation: Model.BelongsToOneRelation,
              modelClass: Person,
              join: { from: 'graph_move_person.parentId', to: 'graph_move_person.id' },
            },
            favoritePet: {
              relation: Model.BelongsToOneRelation,
              modelClass: Pet,
              join: { from: 'graph_move_person.favoritePetId', to: 'graph_move_pet.id' },
            },
            badges: {
              relation: Model.HasManyRelation,
              modelClass: Badge,
              join: { from: 'graph_move_person.code', to: 'graph_move_badge.personCode' },
            },
            likedPets: {
              relation: Model.ManyToManyRelation,
              modelClass: Pet,
              join: {
                from: 'graph_move_person.id',
                through: {
                  from: 'graph_move_like.personId',
                  to: 'graph_move_like.petId',
                  extra: ['note'],
                },
                to: 'graph_move_pet.id',
              },
            },
          };
        }
      }

      // Models that require a name, for the paths that update() writes:
      class NamedPet extends Pet {
        static get jsonSchema() {
          return { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
        }
      }

      class NamedPetPerson extends Person {
        static get relationMappings() {
          const { pets, favoritePet, ...mappings } = super.relationMappings;
          return {
            ...mappings,
            pets: { ...pets, modelClass: NamedPet },
            favoritePet: { ...favoritePet, modelClass: NamedPet },
          };
        }
      }

      const tables = [
        'graph_move_badge',
        'graph_move_like',
        'graph_move_friendship',
        'graph_move_toy',
        'graph_move_pet',
        'graph_move_person',
        'graph_move_category',
      ];

      const dropTables = async () => {
        for (const table of tables) {
          await knex.schema.dropTableIfExists(table);
        }
      };

      // `ownerOnDelete` is the action of the foreign key of the pets' owners,
      // null for no foreign key.
      async function createTables({ ownerOnDelete = 'CASCADE', requiredOwner = false } = {}) {
        await dropTables();
        await knex.schema
          .createTable('graph_move_category', (table) => {
            table.increments('id');
            table.string('name');
          })
          .createTable('graph_move_person', (table) => {
            table.increments('id');
            table.string('name');
            table.string('code');
            table.integer('parentId');
            table.integer('favoritePetId');
          })
          .createTable('graph_move_pet', (table) => {
            table.increments('id');
            table.string('name');
            const ownerId = table.integer('ownerId').unsigned();
            if (ownerOnDelete) {
              ownerId.references('graph_move_person.id').onDelete(ownerOnDelete);
            }
            if (requiredOwner) {
              ownerId.notNullable();
            }
            table.integer('categoryId').unsigned().references('graph_move_category.id');
            table.unique(['ownerId', 'name']);
          })
          .createTable('graph_move_toy', (table) => {
            table.increments('id');
            table.string('name');
            table.integer('petId').unsigned().references('graph_move_pet.id').onDelete('CASCADE');
          })
          .createTable('graph_move_friendship', (table) => {
            table.integer('personId');
            table.integer('friendId');
          })
          .createTable('graph_move_like', (table) => {
            table.integer('personId');
            table.integer('petId');
            table.string('note');
          })
          .createTable('graph_move_badge', (table) => {
            table.increments('id');
            table.string('name');
            table.string('personCode');
          });
      }

      // Person 1, a child of person 99, owns pets 10 and 12, person 2 pet 11
      // and person 3 pet 13. Persons 1 and 2 have the badges 300 and 301 through
      // their codes. The graphs insert person 100, pet 14 and badge 302.
      async function insertRows() {
        await insertRowsWithIds(knex, 'graph_move_category', [
          { id: 5, name: 'cats' },
          { id: 6, name: 'dogs' },
        ]);
        await insertRowsWithIds(knex, 'graph_move_person', [
          { id: 1, name: 'p1', code: 'c1', parentId: 99 },
          { id: 2, name: 'p2', code: 'c2' },
          { id: 3, name: 'p3', code: 'c3' },
          { id: 99, name: 'root', code: 'c99' },
        ]);
        await insertRowsWithIds(knex, 'graph_move_pet', [
          { id: 10, name: 'Fluffy', ownerId: 1, categoryId: 5 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
        await insertRowsWithIds(knex, 'graph_move_toy', [{ id: 100, name: 'ball', petId: 10 }]);
        await insertRowsWithIds(knex, 'graph_move_badge', [
          { id: 300, name: 'b1', personCode: 'c1' },
          { id: 301, name: 'b2', personCode: 'c2' },
        ]);
        await knex('graph_move_friendship').insert([
          { personId: 1, friendId: 3 },
          { personId: 2, friendId: 99 },
        ]);
      }

      function selectPeople() {
        return knex('graph_move_person').select('id', 'name', 'favoritePetId').orderBy('id');
      }

      function selectPets() {
        return knex('graph_move_pet').select('id', 'name', 'ownerId').orderBy('id');
      }

      function selectCodes() {
        return knex('graph_move_person').select('id', 'code').orderBy('id');
      }

      function selectBadges() {
        return knex('graph_move_badge').select('id', 'name', 'personCode').orderBy('id');
      }

      beforeAll(() => {
        for (const modelClass of [Category, Badge, Toy, Pet, Person]) {
          modelClass.knex(knex);
        }
      });

      afterAll(dropTables);
      it('should delete a row before inserting a row with its unique key', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph({ id: 1, pets: [{ name: 'Fluffy' }] });

        expect(await selectPets()).toEqual([
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 13, name: 'Kit', ownerId: 3 },
          { id: 14, name: 'Fluffy', ownerId: 1 },
        ]);
        expect(await knex('graph_move_toy')).toEqual([]);
      });

      it('should delete the replaced category of a row that stays with its owner', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          { id: 1, pets: [{ id: 12 }, { id: 10, categoryId: 6, category: { id: 6 } }] },
          { relate: true },
        );

        expect(await knex('graph_move_pet').select('id', 'categoryId').where('id', 10)).toEqual([
          { id: 10, categoryId: 6 },
        ]);
        expect(await knex('graph_move_category').orderBy('id')).toEqual([{ id: 6, name: 'dogs' }]);
      });

      it('should delete the old owner that a root row replaces through its own relation', async () => {
        await createTables();
        await insertRows();

        await Pet.query().upsertGraph({ id: 10, owner: { id: 2 } }, { relate: true });

        expect((await selectPeople()).map(({ id }) => id)).toEqual([2, 3, 99]);
        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 2 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      it('should read the siblings of a root row at the key that it changes itself', async () => {
        await createTables();
        await insertRows();

        await Pet.query().upsertGraph(
          { id: 10, ownerId: 2, siblings: [{ id: 10 }, { id: 11 }] },
          { relate: true },
        );

        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 2 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      // The new person's pets list the new pet, which its moved pet's siblings
      // leave out:
      it('should keep a new row that a moved row leaves out of a relation with the same key', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          { name: 'new', pets: [{ id: 10, siblings: [{ id: 10 }] }, { name: 'Bo' }] },
          { relate: true },
        );

        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 100 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
          { id: 14, name: 'Bo', ownerId: 100 },
        ]);
      });

      // Pet 20 is inserted through the new person's liked pets and related
      // through its pets, which keep it. SQL Server takes no
      // explicit ids in identity columns:
      it.skipIf(session.isMsSql())(
        'should keep a row that one place inserts and another relates',
        async () => {
          await createTables();
          await insertRows();

          await Person.query().upsertGraph(
            {
              name: 'new',
              pets: [{ id: 10, siblings: [{ id: 10 }] }, { id: 20 }],
              likedPets: [{ id: 20, name: 'X' }],
            },
            { relate: true, insertMissing: ['likedPets'] },
          );

          expect((await selectPets()).filter(({ id }) => [10, 20].includes(id))).toEqual([
            { id: 10, name: 'Fluffy', ownerId: 100 },
            { id: 20, name: 'X', ownerId: 100 },
          ]);
        },
      );

      // Person 1's children leave out person 2, which names person 1 as its
      // parent:
      it('should keep a row with the parent that it names and that leaves it out', async () => {
        await createTables();
        await insertRows();
        await knex('graph_move_person').where('id', 2).update({ parentId: 1 });

        await Person.query().upsertGraph(
          { id: 2, parent: { id: 1, children: [] } },
          { relate: true },
        );

        expect(await knex('graph_move_person').select('id', 'parentId').orderBy('id')).toEqual([
          { id: 1, parentId: 99 },
          { id: 2, parentId: 1 },
          { id: 3, parentId: null },
          { id: 99, parentId: null },
        ]);
      });

      // Person 99 is fetched once for both of its places, with the children of
      // the one that gives them:
      it('should remove the rows that a relation leaves out in one of two places of a row', async () => {
        for (const reversed of [false, true]) {
          await createTables();
          await insertRows();
          await knex('graph_move_person').where('id', 3).update({ parentId: 99 });

          const people = [
            { id: 99, children: [{ id: 1 }] },
            { id: 99, name: 'r' },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            unrelate: true,
          });

          expect(await knex('graph_move_person').select('id', 'parentId').orderBy('id')).toEqual([
            { id: 1, parentId: 99 },
            { id: 2, parentId: null },
            { id: 3, parentId: null },
            { id: 99, parentId: null },
          ]);
        }
      });

      // Person 1 is fetched once for both of its places, with the parent of the
      // one that gives it:
      it('should delete the replaced BelongsToOne row of one of two places of a row', async () => {
        for (const reversed of [false, true]) {
          await createTables();
          await insertRows();

          const people = [
            { id: 1, parent: { id: 3 } },
            { id: 1, name: 'p1' },
          ];
          await Person.query().upsertGraph(reversed ? people.reverse() : people, {
            relate: true,
          });

          expect(await knex('graph_move_person').select('id', 'parentId').orderBy('id')).toEqual([
            { id: 1, parentId: 3 },
            { id: 2, parentId: null },
            { id: 3, parentId: null },
          ]);
        }
      });

      // Pet 10 isn't the favorite pet of person 2, so the mark is ignored, also
      // where the relations of the moved person are written:
      it('should keep a BelongsToOne row of a moved row that is marked but not related', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          { id: 3, children: [{ id: 2, favoritePet: { id: 10, '#delete': true } }] },
          { relate: true, allowMarkers: true },
        );

        expect((await selectPets()).map(({ id }) => id)).toEqual([10, 11, 12, 13]);
        expect(await selectPeople()).toContainEqual({ id: 2, name: 'p2', favoritePetId: null });
      });

      // `noRelate` ignores person 1's pets, so pet 11 stays with person 2, and so
      // does its new sibling:
      it('should insert a sibling at the key of a row that an ignored place relates', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 1, pets: [{ id: 11 }] },
            { id: 2, favoritePet: { id: 11, siblings: [{ id: 11 }, { name: 'S' }] } },
          ],
          { relate: true, noRelate: ['pets'], noUnrelate: true },
        );

        expect((await selectPets()).find(({ name }) => name === 'S').ownerId).toBe(2);
      });

      // `noRelate` ignores the pets of the moved person 2:
      it('should insert a sibling at the key of a row that an ignored place below a moved row relates', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 1, children: [{ id: 2, pets: [{ id: 11 }, { id: 13 }] }] },
            { id: 3, favoritePet: { id: 13, siblings: [{ id: 13 }, { name: 'S' }] } },
          ],
          { relate: true, noRelate: ['children.pets'] },
        );

        expect((await selectPets()).find(({ name }) => name === 'S').ownerId).toBe(3);
      });

      // `noRelate` ignores the siblings of pet 11, so pet 13 stays with person 3,
      // and so does its new sibling:
      it('should insert a sibling at the key of a row that an ignored place below a moved row moves', async () => {
        await createTables();
        await insertRows();

        await Pet.query().upsertGraph(
          [
            { id: 10, siblings: [{ id: 11, siblings: [{ id: 13 }] }] },
            { id: 13, siblings: [{ id: 13 }, { name: 'S' }] },
          ],
          { relate: true, noRelate: ['siblings.siblings'], noDelete: true },
        );

        expect((await selectPets()).find(({ name }) => name === 'S').ownerId).toBe(3);
      });

      it('should keep the old owners in a chain of moved rows that name their new owners', async () => {
        await createTables();
        await insertRows();
        await knex('graph_move_person').where('id', 2).update({ parentId: 99 });

        await Person.query().upsertGraph(
          {
            id: 3,
            children: [
              { id: 2, pets: [{ id: 11 }, { id: 10, owner: { id: 2, parent: { id: 3 } } }] },
            ],
          },
          { relate: true },
        );

        expect(await knex('graph_move_person').select('id', 'parentId').orderBy('id')).toEqual([
          { id: 1, parentId: 99 },
          { id: 2, parentId: 3 },
          { id: 3, parentId: null },
          { id: 99, parentId: null },
        ]);
        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 2 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      // Person 2 likes pet 11 at its own place and the new pet where it moves:
      it('should relate the many-to-many rows of all places of a moved row', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 2, likedPets: [{ id: 11 }] },
            { id: 3, children: [{ id: 2, likedPets: [{ name: 'new' }] }] },
          ],
          { relate: true },
        );

        const [pet] = await knex('graph_move_pet').where('name', 'new');
        expect(
          await knex('graph_move_like').where('personId', 2).orderBy('petId').pluck('petId'),
        ).toEqual([11, pet.id]);
      });

      it('should read a to-many relation of a moved row at its new key', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          { id: 2, pets: [{ id: 11 }, { id: 10, siblings: [{ id: 11 }, { id: 10 }] }] },
          { relate: true },
        );

        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 2 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      it('should read a many-to-many relation of a moved row at its new key', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          { id: 2, pets: [{ id: 11 }, { id: 10, ownerFriends: [{ id: 99 }, { id: 3 }] }] },
          { relate: true, unrelate: true },
        );

        expect((await selectPets()).find(({ id }) => id === 10).ownerId).toBe(2);
        expect(await knex('graph_move_friendship').orderBy(['personId', 'friendId'])).toEqual([
          { personId: 1, friendId: 3 },
          { personId: 2, friendId: 3 },
          { personId: 2, friendId: 99 },
        ]);
      });

      it('should keep the old owner when a moved row also names its new owner', async () => {
        for (const [owner, name] of [
          [{ id: 2, name: 'p2x' }, 'p2x'],
          [{ id: 2 }, 'p2'],
        ]) {
          await createTables();
          await insertRows();

          await Person.query().upsertGraph(
            { id: 2, pets: [{ id: 11 }, { id: 10, owner }] },
            { relate: true },
          );

          expect((await selectPeople()).map(({ id, name }) => ({ id, name }))).toEqual([
            { id: 1, name: 'p1' },
            { id: 2, name },
            { id: 3, name: 'p3' },
            { id: 99, name: 'root' },
          ]);
          expect(await selectPets()).toEqual([
            { id: 10, name: 'Fluffy', ownerId: 2 },
            { id: 11, name: 'Rex', ownerId: 2 },
            { id: 12, name: 'Tom', ownerId: 1 },
            { id: 13, name: 'Kit', ownerId: 3 },
          ]);
        }
      });

      it('should move a row out of its deleted owner before another place writes it after an insert', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 99, children: [] },
            { id: 2, pets: [{ id: 11 }, { id: 10 }] },
            {
              id: 3,
              pets: [{ id: 13 }, { '#id': 't', name: 'newname' }],
              favoritePet: { id: 10, name: '#ref{t.name}' },
            },
          ],
          { relate: true, allowRefs: true },
        );

        expect(await selectPeople()).toEqual([
          { id: 2, name: 'p2', favoritePetId: null },
          { id: 3, name: 'p3', favoritePetId: 10 },
          { id: 99, name: 'root', favoritePetId: null },
        ]);
        expect(await selectPets()).toEqual([
          { id: 10, name: 'newname', ownerId: 2 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 13, name: 'Kit', ownerId: 3 },
          { id: 14, name: 'newname', ownerId: 3 },
        ]);
        expect(await knex('graph_move_toy')).toEqual([{ id: 100, name: 'ball', petId: 10 }]);
      });

      // A documented limit.
      it('should fail to move a row that waits for an insert after the delete of its owner cascades to it', async () => {
        await createTables();
        await insertRows();

        const err = await Person.query()
          .upsertGraph(
            [
              { id: 99, children: [] },
              { id: 2, pets: [{ id: 11 }, { id: 10, name: '#ref{t.name}' }] },
              { id: 3, pets: [{ id: 13 }, { '#id': 't', name: 'newname' }] },
            ],
            { relate: true, allowRefs: true },
          )
          .catch((err) => err);

        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.message).toBe(
          'model (id=10) was not found when updating it. An earlier write of the graph or a concurrent query may have deleted it',
        );
        expect(await selectPets()).toEqual([
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 13, name: 'Kit', ownerId: 3 },
          { id: 14, name: 'newname', ownerId: 3 },
        ]);
      });

      it('should move a row with a NOT NULL key to a new owner without unrelating it first', async () => {
        await createTables({ requiredOwner: true });
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 1, pets: [{ id: 12 }] },
            { name: 'newOwner', pets: [{ id: 10 }] },
          ],
          { relate: true, unrelate: true },
        );

        expect((await selectPeople()).at(-1)).toEqual({
          id: 100,
          name: 'newOwner',
          favoritePetId: null,
        });
        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 100 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      it('should rename a moved row in another place after a delete frees the name', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 2, pets: [{ id: 10 }] },
            { id: 3, favoritePet: { id: 10, name: 'Rex' } },
          ],
          { relate: true },
        );

        expect((await selectPeople()).find(({ id }) => id === 3).favoritePetId).toBe(10);
        expect(await selectPets()).toEqual([
          { id: 10, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      it('should write a moved row that a many-to-many place lists before the move', async () => {
        await createTables();
        await insertRows();

        await Person.query().upsertGraph(
          [
            { id: 3, likedPets: [{ id: 10, name: 'Fluffy2', note: 'n' }] },
            { id: 2, pets: [{ id: 11 }, { id: 10 }] },
          ],
          { relate: true },
        );

        expect((await selectPets()).find(({ id }) => id === 10)).toEqual({
          id: 10,
          name: 'Fluffy2',
          ownerId: 2,
        });
        expect(await knex('graph_move_like')).toEqual([{ personId: 3, petId: 10, note: 'n' }]);
      });

      it('should move a row in a patched place and update it in another place', async () => {
        await createTables();
        await insertRows();

        await NamedPetPerson.query().upsertGraph(
          [
            { id: 2, pets: [{ id: 11 }, { id: 10 }] },
            { id: 3, favoritePet: { id: 10, name: 'Fluffy2' } },
          ],
          { relate: true, update: ['favoritePet'] },
        );

        expect((await selectPets()).find(({ id }) => id === 10)).toEqual({
          id: 10,
          name: 'Fluffy2',
          ownerId: 2,
        });
      });

      it('should move a row in an updated place and patch it in another place', async () => {
        await createTables();
        await insertRows();

        await NamedPetPerson.query().upsertGraph(
          [
            {
              id: 2,
              pets: [
                { id: 11, name: 'Rex' },
                { id: 10, name: 'Fluffy2' },
              ],
            },
            { id: 3, favoritePet: { id: 10, categoryId: 6 } },
          ],
          { relate: true, update: ['pets'] },
        );

        expect(
          await knex('graph_move_pet')
            .select('id', 'name', 'ownerId', 'categoryId')
            .where('id', 10),
        ).toEqual([{ id: 10, name: 'Fluffy2', ownerId: 2, categoryId: 6 }]);
      });

      // A documented limit.
      it('should fail to move a row to a new owner after the delete of its old owner cascades to it', async () => {
        await createTables();
        await insertRows();

        const err = await Person.query()
          .upsertGraph(
            [
              { id: 99, children: [] },
              { name: 'newOwner', pets: [{ id: 10 }] },
            ],
            { relate: true },
          )
          .catch((err) => err);

        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.message).toBe(
          'model (id=10) was not found when updating it. An earlier write of the graph or a concurrent query may have deleted it',
        );
        expect(await selectPets()).toEqual([
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      for (const ownerOnDelete of ['SET NULL', null]) {
        describe(`pets with ${ownerOnDelete ?? 'no foreign key'} on the delete of their owner`, () => {
          // The row that stays with the deleted owner:
          const tom = { id: 12, name: 'Tom', ownerId: ownerOnDelete ? null : 1 };
          it('should move a row to a new owner after the delete of its old owner', async () => {
            await createTables({ ownerOnDelete });
            await insertRows();

            await Person.query().upsertGraph(
              [
                { id: 99, children: [] },
                { name: 'newOwner', pets: [{ id: 10 }] },
              ],
              { relate: true },
            );

            expect(await selectPets()).toEqual([
              { id: 10, name: 'Fluffy', ownerId: 100 },
              { id: 11, name: 'Rex', ownerId: 2 },
              tom,
              { id: 13, name: 'Kit', ownerId: 3 },
            ]);
          });

          it('should move a row to the new row that replaces its deleted owner', async () => {
            await createTables({ ownerOnDelete });
            await insertRows();

            await Person.query().upsertGraph(
              { id: 99, children: [{ name: 'newChild', pets: [{ id: 10 }] }] },
              { relate: true },
            );

            expect(
              await knex('graph_move_person').select('id', 'name', 'parentId').orderBy('id'),
            ).toEqual([
              { id: 2, name: 'p2', parentId: null },
              { id: 3, name: 'p3', parentId: null },
              { id: 99, name: 'root', parentId: null },
              { id: 100, name: 'newChild', parentId: 99 },
            ]);
            expect(await selectPets()).toEqual([
              { id: 10, name: 'Fluffy', ownerId: 100 },
              { id: 11, name: 'Rex', ownerId: 2 },
              tom,
              { id: 13, name: 'Kit', ownerId: 3 },
            ]);
          });
        });
      }
      it('should insert the new owner of a root row before deleting the old one', async () => {
        await createTables();
        await insertRows();

        await Pet.query().upsertGraph({ id: 13, owner: { name: 'new' } });

        expect((await selectPeople()).map(({ id, name }) => ({ id, name }))).toEqual([
          { id: 1, name: 'p1' },
          { id: 2, name: 'p2' },
          { id: 99, name: 'root' },
          { id: 100, name: 'new' },
        ]);
        expect((await selectPets()).find(({ id }) => id === 13)).toEqual({
          id: 13,
          name: 'Kit',
          ownerId: 100,
        });
      });

      // A documented limit, as the moves to new owners run after the inserts.
      it('should fail to insert a row with the unique key of a row that moves to a new owner', async () => {
        await createTables();
        await insertRows();

        await expect(
          Person.query().upsertGraph(
            [
              { id: 1, pets: [{ id: 12 }, { name: 'Fluffy' }] },
              { name: 'newOwner', pets: [{ id: 10 }] },
            ],
            { relate: true, unrelate: true },
          ),
        ).rejects.toThrow(UniqueViolationError);

        expect(await selectPets()).toEqual([
          { id: 10, name: 'Fluffy', ownerId: 1 },
          { id: 11, name: 'Rex', ownerId: 2 },
          { id: 12, name: 'Tom', ownerId: 1 },
          { id: 13, name: 'Kit', ownerId: 3 },
        ]);
      });

      describe('keys of rows in several places', () => {
        // Person 1's pets leave pet 12 out, which clears its owner, while its
        // other place gives it a sibling by that owner.
        it('should fail to place siblings by a key that another place clears', async () => {
          await createTables();
          await insertRows();
          const pets = await selectPets();

          const err = await Person.query()
            .upsertGraph(
              [
                { id: 1, pets: [{ id: 10 }] },
                { id: 3, favoritePet: { id: 12, siblings: [{ name: 's' }] } },
              ],
              { relate: true, unrelate: true },
            )
            .catch((err) => err);

          expect(err).toBeInstanceOf(ValidationError);
          expect(err.type).toBe('InvalidGraph');
          expect(await selectPets()).toEqual(pets);
        });

        // Pet 13 is placed at person 3 and in the siblings of pet 11 that is the
        // favorite pet of person 2, where `noUpdate` keeps its key at 3.
        it('should fail with two different keys given to the siblings of one slot', async () => {
          await createTables();
          await insertRows();

          const err = await Person.query()
            .upsertGraph(
              [
                { id: 3, pets: [{ id: 13 }] },
                {
                  id: 2,
                  favoritePet: { id: 11, ownerId: 3, siblings: [{ id: 13 }, { name: 'n' }] },
                },
              ],
              { relate: true, noDelete: true, noUpdate: ['favoritePet'] },
            )
            .catch((err) => err);

          expect(err).toBeInstanceOf(ValidationError);
          expect(err.type).toBe('InvalidGraph');
          expect(await selectPets()).toEqual([
            { id: 10, name: 'Fluffy', ownerId: 1 },
            { id: 11, name: 'Rex', ownerId: 2 },
            { id: 12, name: 'Tom', ownerId: 1 },
            { id: 13, name: 'Kit', ownerId: 3 },
          ]);
        });

        // Pets 10 and 11 list each other at different owners.
        it('should fail with two rows that list each other as siblings at different owners', async () => {
          await createTables();
          await insertRows();

          const err = await Pet.query()
            .upsertGraph(
              [
                { id: 10, siblings: [{ id: 11 }] },
                { id: 11, siblings: [{ id: 10 }] },
              ],
              { relate: true, noDelete: true },
            )
            .catch((err) => err);

          expect(err).toBeInstanceOf(ValidationError);
          expect(err.type).toBe('InvalidGraph');
          expect(await selectPets()).toEqual([
            { id: 10, name: 'Fluffy', ownerId: 1 },
            { id: 11, name: 'Rex', ownerId: 2 },
            { id: 12, name: 'Tom', ownerId: 1 },
            { id: 13, name: 'Kit', ownerId: 3 },
          ]);
        });

        // `noUpdate` keeps person 1 from writing the code that the graph gives,
        // so the badges are related to the code that it has.
        it('should ignore a given key that noUpdate does not write', async () => {
          await createTables();
          await insertRows();

          await Person.query().upsertGraph(
            { id: 1, code: 'zz', badges: [{ name: 'nb' }] },
            { noUpdate: true, noDelete: true },
          );

          expect((await selectCodes()).find(({ id }) => id === 1)).toEqual({ id: 1, code: 'c1' });
          expect(await selectBadges()).toContainEqual({ id: 302, name: 'nb', personCode: 'c1' });
        });

        // Without a foreign key, the code of person 3 is patched at one root and
        // read by the badges at the other.
        it('should give the related rows the key that another place of the row patches', async () => {
          await createTables();
          await insertRows();

          await Person.query().upsertGraph([
            { id: 3, code: 'x' },
            { id: 3, badges: [{ name: 'nb' }] },
          ]);

          expect((await selectCodes()).find(({ id }) => id === 3)).toEqual({ id: 3, code: 'x' });
          expect(await selectBadges()).toContainEqual({ id: 302, name: 'nb', personCode: 'x' });
        });
      });
    });

    describe('rows of HasOneRelation slots', () => {
      const { knex } = session;

      class Passport extends Model {
        static get tableName() {
          return 'graph_move_passport';
        }

        static get relationMappings() {
          return {
            people: {
              relation: Model.HasManyRelation,
              modelClass: Person,
              join: { from: 'graph_move_passport.id', to: 'graph_move_holder.passportRefId' },
            },
          };
        }
      }

      class Person extends Model {
        static get tableName() {
          return 'graph_move_holder';
        }

        static get relationMappings() {
          return {
            passport: {
              relation: Model.HasOneRelation,
              modelClass: Passport,
              join: { from: 'graph_move_holder.id', to: 'graph_move_passport.personId' },
            },
            passportRef: {
              relation: Model.BelongsToOneRelation,
              modelClass: Passport,
              join: { from: 'graph_move_holder.passportRefId', to: 'graph_move_passport.id' },
            },
            children: {
              relation: Model.HasManyRelation,
              modelClass: Person,
              join: { from: 'graph_move_holder.id', to: 'graph_move_holder.parentId' },
            },
          };
        }
      }

      const dropTables = () =>
        knex.schema.dropTableIfExists('graph_move_passport').dropTableIfExists('graph_move_holder');

      // `personOnDelete` is the action of the foreign key of the passports'
      // people, null for none.
      async function createTables({
        personOnDelete = null,
        requiredPerson = false,
        uniquePerson = true,
      } = {}) {
        await dropTables();
        await knex.schema
          .createTable('graph_move_holder', (table) => {
            table.increments('id');
            table.string('name');
            table.integer('parentId');
            table.integer('passportRefId');
            table.integer('tag');
          })
          .createTable('graph_move_passport', (table) => {
            table.increments('id');
            table.string('no');
            const personId = table
              .integer('personId')
              .unsigned()
              .references('graph_move_holder.id');
            if (personOnDelete) {
              personId.onDelete(personOnDelete);
            }
            if (requiredPerson) {
              personId.notNullable();
            }
            if (uniquePerson) {
              table.unique(['personId']);
            }
          });
      }

      function selectPeople() {
        return knex('graph_move_holder').select('id', 'name', 'passportRefId', 'tag').orderBy('id');
      }

      function selectPassports() {
        return knex('graph_move_passport').orderBy('id');
      }

      beforeAll(() => {
        Person.knex(knex);
      });

      afterAll(dropTables);

      describe('swapped between a person and a new one', () => {
        // Person 2, a child of person 9, has passport 20 (R), which moves into
        // the slot of person 1, whose passport 10 (S) moves to the new person 10:
        async function insertRows() {
          await insertRowsWithIds(knex, 'graph_move_holder', [
            { id: 1, name: 'P' },
            { id: 2, name: 'O', parentId: 9 },
            { id: 9, name: 'root' },
          ]);
          await insertRowsWithIds(knex, 'graph_move_passport', [
            { id: 10, no: 'S', personId: 1 },
            { id: 20, no: 'R', personId: 2 },
          ]);
        }
        it('should move the rows with nullable and NOT NULL keys', async () => {
          for (const requiredPerson of [false, true]) {
            await createTables({ personOnDelete: 'CASCADE', requiredPerson });
            await insertRows();

            await Person.query().upsertGraph(
              [
                { id: 1, passport: { id: 20 } },
                { name: 'new', passport: { id: 10 } },
              ],
              { relate: true },
            );

            expect(await selectPassports()).toEqual([
              { id: 10, no: 'S', personId: 10 },
              { id: 20, no: 'R', personId: 1 },
            ]);
          }
        });

        // A documented limit.
        it('should fail to move a row after the delete of its old owner cascades to it', async () => {
          for (const requiredPerson of [false, true]) {
            await createTables({ personOnDelete: 'CASCADE', requiredPerson });
            await insertRows();

            const err = await Person.query()
              .upsertGraph(
                [
                  { id: 9, children: [] },
                  { id: 1, passport: { id: 20 } },
                  { name: 'new', passport: { id: 10 } },
                ],
                { relate: true },
              )
              .catch((err) => err);

            expect(err).toBeInstanceOf(NotFoundError);
            expect(err.message).toBe(
              'model (id=20) was not found when updating it. An earlier write of the graph or a concurrent query may have deleted it',
            );
            expect(await selectPassports()).toEqual([{ id: 10, no: 'S', personId: 10 }]);
          }
        });

        it('should move a row after the delete of its old owner without a cascade', async () => {
          await createTables({ personOnDelete: 'SET NULL' });
          await insertRows();

          await Person.query().upsertGraph(
            [
              { id: 9, children: [] },
              { id: 1, passport: { id: 20 } },
              { name: 'new', passport: { id: 10 } },
            ],
            { relate: true },
          );

          expect((await selectPeople()).map(({ id }) => id)).toEqual([1, 9, 10]);
          expect(await selectPassports()).toEqual([
            { id: 10, no: 'S', personId: 10 },
            { id: 20, no: 'R', personId: 1 },
          ]);
        });
      });

      describe('cycles of inserts and moves out of a slot', () => {
        // Person 1 has passport 10 (S). The graphs insert person 2 and
        // passport 11.
        async function insertRows() {
          await insertRowsWithIds(knex, 'graph_move_holder', [{ id: 1, name: 'P' }]);
          await insertRowsWithIds(knex, 'graph_move_passport', [{ id: 10, no: 'S', personId: 1 }]);
        }

        // The new passport N takes the slot of person 1, and its current
        // passport S moves to the new person, whose name reads N's id. That's
        // a cycle, which the slot yields: N is inserted before S moves, which
        // only works without a unique key on the slot.
        it('should insert a row into a slot before its current row moves to a new owner that reads its id', async () => {
          await createTables({ uniquePerson: false });
          await insertRows();

          await Person.query().upsertGraph(
            [
              { id: 1, passport: { '#id': 'n', no: 'N' } },
              { name: 'q#ref{n.id}', passport: { id: 10 } },
            ],
            { relate: true, allowRefs: true },
          );

          expect(await selectPeople()).toEqual([
            { id: 1, name: 'P', passportRefId: null, tag: null },
            { id: 2, name: 'q11', passportRefId: null, tag: null },
          ]);
          expect(await selectPassports()).toEqual([
            { id: 10, no: 'S', personId: 2 },
            { id: 11, no: 'N', personId: 1 },
          ]);
        });

        // The new owner of S is also placed in N.people, with a #ref.
        it('should insert a row into a slot that a #ref place of the new owner of its current row reads', async () => {
          await createTables();
          await insertRows();

          await Person.query().upsertGraph(
            [
              { id: 1, passport: { '#id': 'n', no: 'N', people: [{ '#ref': 'q' }] } },
              { '#id': 'q', name: 'Q', passport: { id: 10 } },
            ],
            { relate: true, allowRefs: true },
          );

          expect(await selectPeople()).toEqual([
            { id: 1, name: 'P', passportRefId: null, tag: null },
            { id: 2, name: 'Q', passportRefId: 11, tag: null },
          ]);
          expect(await selectPassports()).toEqual([
            { id: 10, no: 'S', personId: 2 },
            { id: 11, no: 'N', personId: 1 },
          ]);
        });

        // The same, with a prop of the #ref place that reads N's id.
        it('should write the props of a #ref place that read the id of the row in the slot', async () => {
          await createTables({ uniquePerson: false });
          await insertRows();

          await Person.query().upsertGraph(
            [
              {
                id: 1,
                passport: { '#id': 'n', no: 'N', people: [{ '#ref': 'q', tag: '#ref{n.id}' }] },
              },
              { '#id': 'q', name: 'Q', passport: { id: 10 } },
            ],
            { relate: true, allowRefs: true },
          );

          expect(await selectPeople()).toEqual([
            { id: 1, name: 'P', passportRefId: null, tag: null },
            { id: 2, name: 'Q', passportRefId: 11, tag: 11 },
          ]);
          expect(await selectPassports()).toEqual([
            { id: 10, no: 'S', personId: 2 },
            { id: 11, no: 'N', personId: 1 },
          ]);
        });

        // N is inserted for the passportRef of the new owner of S, and
        // its #ref place takes the slot of person 1 that S leaves.
        it('should relate a #ref into a slot after its current row moves to the new owner that inserts it', async () => {
          await createTables();
          await insertRows();

          await Person.query().upsertGraph(
            [
              { id: 1, passport: { '#ref': 'q' } },
              { name: 'Z', passport: { id: 10 }, passportRef: { '#id': 'q', no: 'N' } },
            ],
            { relate: true, allowRefs: true },
          );

          expect(await selectPeople()).toEqual([
            { id: 1, name: 'P', passportRefId: null, tag: null },
            { id: 2, name: 'Z', passportRefId: 11, tag: null },
          ]);
          expect(await selectPassports()).toEqual([
            { id: 10, no: 'S', personId: 2 },
            { id: 11, no: 'N', personId: 1 },
          ]);
        });
      });
    });
  });
};
