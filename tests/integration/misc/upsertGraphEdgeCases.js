import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  const collectQueries = async (callback) => {
    const queries = [];
    const onQuery = (query) => queries.push(query);
    session.knex.on('query', onQuery);

    try {
      await callback();
    } finally {
      session.knex.removeListener('query', onQuery);
    }

    return queries;
  };

  describe('upsertGraph() edge cases of loading, pruning and writing', () => {
    const { knex } = session;

    class Toy extends Model {
      static get tableName() {
        return 'graph_edge_toy';
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'graph_edge_pet';
      }

      static get relationMappings() {
        return {
          favoriteToy: {
            relation: Model.BelongsToOneRelation,
            modelClass: Toy,
            join: { from: 'graph_edge_pet.favoriteToyId', to: 'graph_edge_toy.id' },
          },
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_edge_pet.ownerId', to: 'graph_edge_person.id' },
          },
          toys: {
            relation: Model.HasManyRelation,
            modelClass: Toy,
            join: { from: 'graph_edge_pet.id', to: 'graph_edge_toy.petId' },
          },
        };
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'graph_edge_person';
      }

      static get jsonAttributes() {
        return ['idolIds'];
      }

      static get relationMappings() {
        return {
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'graph_edge_person.id', to: 'graph_edge_person.parentId' },
          },
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_edge_person.parentId', to: 'graph_edge_person.id' },
          },
          boss: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_edge_person.bossId', to: 'graph_edge_person.id' },
          },
          friends: {
            relation: Model.ManyToManyRelation,
            modelClass: Person,
            join: {
              from: 'graph_edge_person.id',
              through: { from: 'graph_edge_friend.aId', to: 'graph_edge_friend.bId' },
              to: 'graph_edge_person.id',
            },
          },
          idols: {
            relation: Model.BelongsToManyRelation,
            modelClass: Person,
            join: { from: 'graph_edge_person.idolIds', to: 'graph_edge_person.id' },
          },
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_edge_person.id', to: 'graph_edge_pet.ownerId' },
          },
          petsByCode: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_edge_person.code', to: 'graph_edge_pet.ownerCode' },
          },
        };
      }
    }

    const tables = ['graph_edge_friend', 'graph_edge_toy', 'graph_edge_pet', 'graph_edge_person'];

    const dropTables = async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }
    };

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('graph_edge_person', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('parentId');
          table.integer('bossId');
          table.string('code');
          // The pg drivers only parse JSON columns.
          if (session.isPostgres()) {
            table.jsonb('idolIds');
          } else {
            table.text('idolIds');
          }
        })
        .createTable('graph_edge_pet', (table) => {
          table.increments('id');
          table.string('name');
          table.string('kind').notNullable().defaultTo('plain');
          table.integer('ownerId');
          table.string('ownerCode');
          table.integer('favoriteToyId');
          table.unique(['ownerId', 'name']);
        })
        .createTable('graph_edge_toy', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('petId');
        })
        .createTable('graph_edge_friend', (table) => {
          table.integer('aId');
          table.integer('bId');
        });
    });

    // Truncating resets the ids, which the rows get in the order of insertion:
    // persons 1 to 3, pets 1 and 2 of person 2 and pet 3 of person 3, toys 1 and
    // 2 of pet 1 and toys 3 and 4 of pet 3.
    beforeEach(async () => {
      for (const table of tables) {
        await knex(table).truncate();
      }

      for (const name of ['root', 'friend', 'other']) {
        await knex('graph_edge_person').insert({ name, code: name });
      }

      for (const [name, ownerId] of [
        ['p1', 2],
        ['p2', 2],
        ['p3', 3],
      ]) {
        await knex('graph_edge_pet').insert({ name, ownerId });
      }

      for (const [name, petId] of [
        ['t1', 1],
        ['t2', 1],
        ['t3', 3],
        ['t4', 3],
      ]) {
        await knex('graph_edge_toy').insert({ name, petId });
      }
    });

    afterAll(dropTables);

    const toyIds = async () => (await knex('graph_edge_toy').orderBy('id')).map((toy) => toy.id);

    describe('rows below models that are pruned', () => {
      it('should not remove the rows below a related model that noRelate skips', async () => {
        await Person.query(knex).upsertGraph(
          { id: 1, friends: [{ id: 2, pets: [{ id: 1, toys: [] }] }] },
          { relate: true, noRelate: ['friends'] },
        );

        expect(await toyIds()).toEqual([1, 2, 3, 4]);
      });

      it('should not remove the rows below a new model that noInsert skips', async () => {
        await Person.query(knex).upsertGraph(
          { id: 1, children: [{ name: 'new', pets: [{ id: 1, toys: [] }] }] },
          { relate: true, noInsert: ['children'] },
        );

        expect(await toyIds()).toEqual([1, 2, 3, 4]);
      });

      it('should not remove the rows below a model marked with #unrelate', async () => {
        await Person.query(knex).upsertGraph(
          { id: 1, friends: [{ id: 2, '#unrelate': true, pets: [{ id: 1, toys: [] }] }] },
          { allowMarkers: true, relate: true },
        );

        expect(await toyIds()).toEqual([1, 2, 3, 4]);
      });
    });

    it('should not load the models below a model that noRelate skips', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, friends: [{ id: 2, children: [{ id: 999, children: [] }] }] },
        { relate: true, noRelate: ['friends'] },
      );

      expect(await knex('graph_edge_friend')).toEqual([]);
    });

    it('should throw before writing for a #dbRef to a missing model with relations', async () => {
      const err = await Person.query(knex)
        .upsertGraph({ id: 1, friends: [{ '#dbRef': 999, children: [{ name: 'nc' }] }] })
        .catch((err) => err);

      expect(err).toBeInstanceOf(Person.NotFoundError);
      expect(await knex('graph_edge_friend')).toEqual([]);
      expect(await knex('graph_edge_person').where('name', 'nc')).toEqual([]);
    });

    it('should keep the markers of the input when the upsert fails', async () => {
      const input = Person.fromJson({
        id: 1,
        friends: [{ id: 2, '#unrelate': true }],
        children: [{ id: 999 }],
      });

      await expect(
        Person.query(knex).upsertGraph(input, { allowMarkers: true }),
      ).rejects.toBeInstanceOf(Person.NotFoundError);
      expect(input.friends[0]['#unrelate']).toBe(true);
    });

    describe('#ref models with relations', () => {
      it('should insert the models below a #ref to a new model', async () => {
        const root = await Person.query(knex).upsertGraph(
          {
            id: 1,
            children: [{ '#id': 'child', name: 'new' }],
            friends: [{ '#ref': 'child', pets: [{ name: 'refpet' }] }],
          },
          { relate: true, allowRefs: true },
        );

        const [child] = root.children;
        expect(await knex('graph_edge_pet').where('name', 'refpet')).toEqual([
          {
            id: expect.any(Number),
            name: 'refpet',
            kind: 'plain',
            ownerId: child.id,
            ownerCode: null,
            favoriteToyId: null,
          },
        ]);
      });

      describe('a #ref to a new model through the BelongsToOneRelation of a related model below it', () => {
        it('should keep the model when the relation is the inverse of the parent relation', async () => {
          const [root] = await Person.query(knex).upsertGraph(
            [{ '#id': 'new', name: 'new', children: [{ id: 3, parent: { '#ref': 'new' } }] }],
            { relate: true, allowRefs: true },
          );

          expect(await knex('graph_edge_person').where('id', root.id)).toHaveLength(1);
          expect(await knex('graph_edge_person').where('id', 3)).toMatchObject([
            { parentId: root.id },
          ]);
        });

        it('should keep the model when the relation leads back to it from another table', async () => {
          const [root] = await Person.query(knex).upsertGraph(
            [{ '#id': 'new', name: 'new', pets: [{ id: 3, owner: { '#ref': 'new' } }] }],
            { relate: true, allowRefs: true },
          );

          expect(await knex('graph_edge_person').where('id', root.id)).toHaveLength(1);
          expect(await knex('graph_edge_pet').where('id', 3)).toMatchObject([{ ownerId: root.id }]);
        });
      });

      it('should upsert the models below a #ref to an existing model', async () => {
        await Person.query(knex).upsertGraph(
          {
            id: 1,
            children: [{ '#id': 'child', id: 2 }],
            friends: [{ '#ref': 'child', pets: [{ id: 2, name: 'renamed' }] }],
          },
          { relate: true, allowRefs: true },
        );

        expect(await knex('graph_edge_pet').where('ownerId', 2).orderBy('id')).toEqual([
          {
            id: 2,
            name: 'renamed',
            kind: 'plain',
            ownerId: 2,
            ownerCode: null,
            favoriteToyId: null,
          },
        ]);
      });

      it('should return the props of the model that an already related #ref refers to', async () => {
        await knex('graph_edge_friend').insert({ aId: 1, bId: 2 });

        const root = await Person.query(knex).upsertGraph(
          {
            id: 1,
            children: [{ '#id': 'child', id: 2, name: 'x2' }],
            friends: [{ '#ref': 'child' }],
          },
          { relate: true, allowRefs: true },
        );

        expect(root.friends[0]).toMatchObject({ id: 2, name: 'x2' });
        expect(await knex('graph_edge_friend')).toEqual([{ aId: 1, bId: 2 }]);
      });

      it('should give a #ref related into a HasManyRelation the key of a parent inserted later (#311)', async () => {
        const [, b] = await Person.query(knex).upsertGraph(
          [
            { name: 'A', boss: { '#id': 'n', name: 'N' } },
            {
              name: 'B',
              boss: { name: 'Q', boss: { name: 'Q2' } },
              children: [{ '#ref': 'n' }],
            },
          ],
          { allowRefs: true, relate: true },
        );

        expect((await knex('graph_edge_person').where('name', 'N').first()).parentId).toBe(b.id);
      });

      // `insertMissing` loads the rows of the models with ids, and the chain of
      // children inserts `x` after the owners of the `#ref` models:
      const insertedLate = {
        name: 'k1',
        children: [{ name: 'k2', children: [{ name: 'X', '#id': 'x' }] }],
      };

      for (const [title, places, getName] of [
        [
          'the place of its model',
          [{ name: 'o', pets: [{ id: 1, '#id': 'p', name: 'of #ref{x.name}' }, { '#ref': 'p' }] }],
          async () => (await knex('graph_edge_pet').where('id', 1).first()).name,
        ],
        [
          'another place',
          [
            { name: 'o', children: [{ id: 1, '#id': 'p', name: 'of #ref{x.name}' }] },
            { name: 'b', boss: { '#ref': 'p' } },
          ],
          async () => (await knex('graph_edge_person').where('id', 1).first()).name,
        ],
        [
          'a place that keeps a key in its row',
          [
            { name: 'f', friends: [{ id: 1, '#id': 'p', name: 'of #ref{x.name}' }] },
            { name: 'o', children: [{ '#ref': 'p' }] },
          ],
          async () => (await knex('graph_edge_person').where('id', 1).first()).name,
        ],
      ]) {
        it(`should write the row of a #ref in ${title} with its resolved values`, async () => {
          await Person.query(knex).upsertGraph(
            { name: 'r', children: [insertedLate, ...places] },
            { allowRefs: true, relate: true, insertMissing: true },
          );

          expect(await getName()).toBe('of X');
        });
      }

      for (const [title, graph] of [
        [
          'as a BelongsToOne',
          [
            { id: 1, children: [{ id: 2, '#id': 'b', name: 'B2' }] },
            { id: 3, boss: { '#ref': 'b' } },
          ],
        ],
        [
          'in a many-to-many relation',
          [
            { id: 1, children: [{ id: 2, '#id': 'b', name: 'B2' }] },
            { id: 3, friends: [{ '#ref': 'b' }] },
          ],
        ],
      ]) {
        it(`should write the row of a #ref ${title} that its path allows, where the path of its model doesn't`, async () => {
          await knex('graph_edge_person').where('id', 2).update({ parentId: 1 });

          await Person.query(knex).upsertGraph(graph, {
            allowRefs: true,
            relate: true,
            noUpdate: ['children'],
          });

          expect((await knex('graph_edge_person').where('id', 2).first()).name).toBe('B2');
        });
      }

      it("should write the row of a #ref in a many-to-many relation it's already in that its path allows", async () => {
        await knex('graph_edge_person').where('id', 2).update({ parentId: 1 });
        await knex('graph_edge_friend').insert({ aId: 3, bId: 2 });

        await Person.query(knex).upsertGraph(
          {
            id: 1,
            children: [
              { id: 2, '#id': 'b', name: 'B2' },
              { id: 3, friends: [{ '#ref': 'b' }] },
            ],
          },
          { allowRefs: true, relate: true, noUpdate: ['children'] },
        );

        expect((await knex('graph_edge_person').where('id', 2).first()).name).toBe('B2');
      });

      it('should insert a new model once when a #ref repeats its place', async () => {
        const updatedNames = [];

        class HookedPet extends Pet {
          $beforeUpdate() {
            updatedNames.push(this.name);
          }
        }

        class HookedPerson extends Person {
          static get relationMappings() {
            const { pets } = super.relationMappings;
            return { pets: { ...pets, modelClass: HookedPet } };
          }
        }

        await HookedPerson.query(knex).upsertGraph(
          { name: 'o', pets: [{ '#id': 'p', name: 'new' }, { '#ref': 'p' }] },
          { allowRefs: true },
        );

        expect(updatedNames).toEqual([]);
        expect(await knex('graph_edge_pet').where('name', 'new')).toHaveLength(1);
      });

      it('should break a cycle through a BelongsToOne key instead of an array of keys', async () => {
        const [a, b] = await Person.query(knex).upsertGraph(
          [
            { '#id': 'a', name: 'A', idols: [{ '#ref': 'b' }] },
            { '#id': 'b', name: 'B', boss: { '#ref': 'a' } },
          ],
          { allowRefs: true },
        );

        expect((await Person.query(knex).findById(a.id)).idolIds).toEqual([b.id]);
        expect((await Person.query(knex).findById(b.id)).bossId).toBe(a.id);
      });
    });

    it('should load and remove the rows below a related model once', async () => {
      const queries = await collectQueries(() =>
        Person.query(knex).upsertGraph(
          { id: 1, friends: [{ id: 3, pets: [{ id: 3, toys: [{ id: 3 }] }] }] },
          { relate: true },
        ),
      );

      const deletes = queries.filter(({ sql }) => /^delete/i.test(sql));
      expect(deletes).toHaveLength(1);
      expect(deletes[0].bindings.filter((value) => value === 4)).toHaveLength(1);
      expect(await toyIds()).toEqual([1, 2, 3]);
    });

    it('should keep a root whose new boss is the model it was the boss of', async () => {
      await knex('graph_edge_person').where('id', 1).update({ bossId: 2 });

      await Person.query(knex).upsertGraph(
        { id: 2, boss: { id: 1, boss: { id: 3 } } },
        { relate: true },
      );

      expect(await knex('graph_edge_person').orderBy('id').select('id', 'bossId')).toEqual([
        { id: 1, bossId: 3 },
        { id: 2, bossId: 1 },
        { id: 3, bossId: null },
      ]);
    });

    it('should read the markers of a model in every place it appears', async () => {
      const friend = Person.fromJson({ '#dbRef': 2 });

      await Person.query(knex).upsertGraph({ id: 1, friends: [friend], children: [friend] });

      expect((await knex('graph_edge_person')).map((person) => person.id).sort()).toEqual([
        1, 2, 3,
      ]);
      expect((await knex('graph_edge_person').where('id', 2).first()).parentId).toBe(1);
    });

    it('should insert the column defaults of rows that leave out columns', async () => {
      await Person.query(knex).insertGraph({
        name: 'new',
        pets: [{ name: 'a', kind: 'cat' }, { name: 'b' }],
      });

      expect(
        await knex('graph_edge_pet').whereIn('name', ['a', 'b']).orderBy('name').select('kind'),
      ).toEqual([{ kind: 'cat' }, { kind: 'plain' }]);
    });

    it('should insert the column defaults of rows that a beforeInsert hook leaves out', async () => {
      class HookedPet extends Pet {
        $beforeInsert() {
          if (this.name === 'a') {
            this.kind = 'cat';
          }
        }
      }

      await HookedPet.query(knex).insertGraph([{ name: 'a' }, { name: 'b' }]);

      expect(
        await knex('graph_edge_pet').whereIn('name', ['a', 'b']).orderBy('name').select('kind'),
      ).toEqual([{ kind: 'cat' }, { kind: 'plain' }]);
    });

    it('should move rows with their other changes, which unique keys may need', async () => {
      await knex('graph_edge_pet').where('id', 3).update({ name: 'p1' });

      await Person.query(knex).upsertGraph(
        { id: 3, pets: [{ id: 3 }, { id: 1, name: 'z' }] },
        { relate: true },
      );

      expect(await knex('graph_edge_pet').where('id', 1).first()).toMatchObject({
        name: 'z',
        ownerId: 3,
      });
    });

    it('should move rows that wait for inserts with their other changes', async () => {
      await knex('graph_edge_pet').where('id', 3).update({ name: 'p1' });

      await Person.query(knex).upsertGraph(
        { id: 3, pets: [{ id: 3 }, { id: 1, name: 'z', favoriteToy: { name: 'new toy' } }] },
        { relate: true },
      );

      const toy = await knex('graph_edge_toy').where('name', 'new toy').first();
      expect(await knex('graph_edge_pet').where('id', 1).first()).toMatchObject({
        name: 'z',
        ownerId: 3,
        favoriteToyId: toy.id,
      });
    });

    describe('hooks of moved rows', () => {
      const parsedNames = [];
      const updatedIds = [];

      class HookedPet extends Pet {
        $parseJson(json, options) {
          parsedNames.push(json.name);
          return super.$parseJson(json, options);
        }

        $beforeUpdate() {
          updatedIds.push(this.id);
        }
      }

      class HookedPerson extends Person {
        static get relationMappings() {
          const { pets } = super.relationMappings;
          return { pets: { ...pets, modelClass: HookedPet } };
        }
      }

      beforeEach(() => {
        parsedNames.length = 0;
        updatedIds.length = 0;
      });

      it('should run them once for rows that wait for inserts', async () => {
        await HookedPerson.query(knex).upsertGraph(
          {
            id: 3,
            pets: [{ id: 3 }, { id: 1, name: 'for #ref{n.name}' }, { '#id': 'n', name: 'new' }],
          },
          { relate: true, allowRefs: true },
        );

        expect(updatedIds).toEqual([1]);
      });

      // The relations of moved rows are upserted after the move, so the row is
      // written once for the move, and once more for the key of its new toy:
      it('should run them for the move and for the relations of the row, with their ids', async () => {
        await HookedPerson.query(knex).upsertGraph(
          { id: 3, pets: [{ id: 3 }, { id: 1, name: 'z', favoriteToy: { name: 'new toy' } }] },
          { relate: true },
        );

        expect(updatedIds).toEqual([1, 1]);
        // The input is parsed once:
        expect(parsedNames).toEqual([undefined, 'z']);
      });
    });

    it('should resolve the references of moved rows to models that are not inserted', async () => {
      await Person.query(knex).upsertGraph(
        {
          id: 3,
          pets: [
            { '#id': 'p', id: 3, name: 'p3' },
            { id: 1, name: 'next to #ref{p.name}' },
          ],
        },
        { relate: true, allowRefs: true },
      );

      expect((await knex('graph_edge_pet').where('id', 1).first()).name).toBe('next to p3');
    });

    it('should run the update hooks of moved rows once', async () => {
      const calls = [];

      class HookedPet extends Pet {
        $beforeUpdate() {
          calls.push(this.ownerId);
        }
      }

      class HookedPerson extends Person {
        static get relationMappings() {
          const { pets } = super.relationMappings;
          return { pets: { ...pets, modelClass: HookedPet } };
        }
      }

      await HookedPerson.query(knex).upsertGraph(
        { id: 3, pets: [{ id: 3 }, { id: 1 }] },
        { relate: true, noDelete: true },
      );

      expect(calls).toEqual([3]);
    });

    it('should write the keys and references of moved rows that wait for inserts', async () => {
      await knex('graph_edge_person').where('id', 3).update({ parentId: 1, bossId: 2 });

      await Person.query(knex).upsertGraph(
        {
          id: 2,
          children: [
            {
              id: 3,
              name: 'is #ref{x.name}',
              boss: { name: 'new boss' },
              idols: [{ name: 'new idol' }],
            },
            { '#id': 'x', name: 'X' },
          ],
        },
        { relate: true, noDelete: true, allowRefs: true },
      );

      const ids = Object.fromEntries(
        (await knex('graph_edge_person')).map((person) => [person.name, person.id]),
      );
      expect(await Person.query(knex).findById(3)).toMatchObject({
        name: 'is X',
        parentId: 2,
        bossId: ids['new boss'],
        idolIds: [ids['new idol']],
      });
    });

    it('should write the keys of moved rows that wait for inserts with noUpdate', async () => {
      await knex('graph_edge_person').where('id', 3).update({ parentId: 1, bossId: 2 });

      await Person.query(knex).upsertGraph(
        { id: 2, children: [{ id: 3, boss: { name: 'new boss' } }] },
        { relate: true, noDelete: true, noUpdate: true },
      );

      const boss = await knex('graph_edge_person').where('name', 'new boss').first();
      expect(await knex('graph_edge_person').where('id', 3).first()).toMatchObject({
        parentId: 2,
        bossId: boss.id,
      });
    });

    it('should not write the references of moved rows before they are resolved', async () => {
      await Person.query(knex).upsertGraph(
        {
          id: 3,
          pets: [
            { id: 3, toys: [{ '#id': 'toy', name: 'new toy' }] },
            { id: 1, favoriteToyId: '#ref{toy.id}' },
          ],
        },
        { relate: true, allowRefs: true },
      );

      const toy = await knex('graph_edge_toy').where('name', 'new toy').first();
      expect(await knex('graph_edge_pet').where('id', 1).first()).toMatchObject({
        ownerId: 3,
        favoriteToyId: toy.id,
      });
    });

    describe('#ref{} to existing models (#356)', () => {
      it('should read the values that the graph gives them', async () => {
        await Person.query(knex).upsertGraph(
          [
            { '#id': 'a', id: 1, boss: { name: 'new boss' } },
            { id: 2, name: 'boss of a: #ref{a.bossId}' },
          ],
          { allowRefs: true },
        );

        const boss = await knex('graph_edge_person').where('name', 'new boss').first();
        expect((await knex('graph_edge_person').where('id', 2).first()).name).toBe(
          `boss of a: ${boss.id}`,
        );
      });

      it('should not wait for the values that the graph leaves alone', async () => {
        await Person.query(knex).upsertGraph(
          [
            { '#id': 'a', id: 1, name: 'root', boss: { '#ref': 'new' } },
            { '#id': 'new', name: 'new boss of #ref{a.name}' },
          ],
          { allowRefs: true },
        );

        const boss = await knex('graph_edge_person').where('name', 'new boss of root').first();
        expect((await knex('graph_edge_person').where('id', 1).first()).bossId).toBe(boss.id);
      });

      it('should keep the keys of BelongsToOne rows that the graph ignores', async () => {
        class RequiredBossPerson extends Person {
          static get jsonSchema() {
            return { type: 'object', required: ['bossId'] };
          }
        }

        await knex('graph_edge_person').where('id', 2).update({ bossId: 1 });

        for (const [boss, options] of [
          [{ id: 3 }, { relate: true, noRelate: true }],
          [{ name: 'new' }, { noInsert: true }],
        ]) {
          const result = await RequiredBossPerson.query(knex).upsertGraph(
            { id: 2, name: 'renamed', boss },
            { update: true, ...options },
          );

          expect(result.bossId).toBe(1);
          expect((await knex('graph_edge_person').where('id', 2).first()).bossId).toBe(1);
        }
      });

      it('should relate a moved model to itself through a #ref', async () => {
        await Person.query(knex).upsertGraph(
          [
            {
              name: 'new',
              children: [{ id: 3, children: [{ id: 2, '#id': 'a', boss: { '#ref': 'a' } }] }],
            },
          ],
          { allowRefs: true, relate: true },
        );

        const newPerson = await knex('graph_edge_person').where('name', 'new').first();
        expect(await knex('graph_edge_person').whereIn('id', [2, 3]).orderBy('id')).toMatchObject([
          { id: 2, parentId: 3, bossId: 2 },
          { id: 3, parentId: newPerson.id },
        ]);
      });

      it('should point an existing model to a new model below it through a #ref', async () => {
        await Person.query(knex).upsertGraph(
          {
            id: 3,
            boss: {
              id: 1,
              boss: { id: 2, children: [{ name: 'new', '#id': 'a' }], boss: { '#ref': 'a' } },
            },
          },
          { allowRefs: true, relate: true },
        );

        const newPerson = await knex('graph_edge_person').where('name', 'new').first();
        expect(newPerson.parentId).toBe(2);
        expect(
          await knex('graph_edge_person').whereIn('id', [1, 2, 3]).orderBy('id'),
        ).toMatchObject([
          { id: 1, bossId: 2 },
          { id: 2, bossId: newPerson.id },
          { id: 3, bossId: 1 },
        ]);
      });

      it('should write nothing for a cycle that it rejects', async () => {
        await expect(
          Person.query(knex).upsertGraph(
            {
              id: 2,
              pets: [],
              children: [
                { '#id': 'a', name: 'a of #ref{b.name}' },
                { '#id': 'b', name: 'b of #ref{a.name}' },
              ],
            },
            { allowRefs: true },
          ),
        ).rejects.toThrow('the object graph contains cyclic references');

        expect(await knex('graph_edge_pet').where('ownerId', 2).pluck('name')).toEqual([
          'p1',
          'p2',
        ]);
      });

      it('should read them in moved rows', async () => {
        await Person.query(knex).upsertGraph(
          [
            { '#id': 'a', id: 2, boss: { name: 'new boss' } },
            { id: 1, children: [{ id: 3, name: 'boss of a: #ref{a.bossId}' }] },
          ],
          { allowRefs: true, relate: true, noDelete: true },
        );

        const boss = await knex('graph_edge_person').where('name', 'new boss').first();
        expect(await knex('graph_edge_person').where('id', 3).first()).toMatchObject({
          parentId: 1,
          name: `boss of a: ${boss.id}`,
        });
      });
    });

    it('should give new models the keys of related parents that the graph leaves out', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, children: [{ id: 2, petsByCode: [{ name: 'new' }] }] },
        { relate: true, noDelete: true },
      );

      expect((await knex('graph_edge_pet').where('name', 'new').first()).ownerCode).toBe('friend');
    });

    it('should give new models the keys of existing parents that the graph leaves out', async () => {
      await Pet.query(knex).upsertGraph({ id: 1, owner: { id: 2, petsByCode: [{ name: 'new' }] } });

      expect((await knex('graph_edge_pet').where('name', 'new').first()).ownerCode).toBe('friend');
    });

    // Spreading the models into the arguments of a call overflows the stack.
    it.skipIf(!session.isSqlite())(
      'should insert more models than a call takes arguments',
      async () => {
        const count = 200000;
        // One transaction instead of a commit per insert, which is slow on
        // the SQLite file of the tests:
        await Toy.transaction(knex, (trx) =>
          Toy.query(trx).insertGraph(Array.from({ length: count }, () => ({ name: 'toy' }))),
        );

        expect(await knex('graph_edge_toy').where('name', 'toy').count('* as count')).toEqual([
          { count },
        ]);
      },
    );
  });

  describe('upsertGraph() patches that bind many values', () => {
    const { knex } = session;
    const columns = Array.from({ length: 80 }, (_, i) => `c${i}`);

    class Wide extends Model {
      static get tableName() {
        return 'graph_edge_wide';
      }
    }

    beforeAll(async () => {
      await knex.schema.dropTableIfExists('graph_edge_wide');
      await knex.schema.createTable('graph_edge_wide', (table) => {
        table.integer('id').primary();

        for (const column of columns) {
          table.integer(column);
        }
      });
    });

    afterAll(() => knex.schema.dropTableIfExists('graph_edge_wide'));

    it('should stay under the number of values that a query can bind', async () => {
      const row = (id, value) => ({
        id,
        ...Object.fromEntries(columns.map((column) => [column, value])),
      });
      const ids = Array.from({ length: 500 }, (_, i) => i + 1);

      for (let i = 0; i < ids.length; i += 10) {
        await knex('graph_edge_wide').insert(ids.slice(i, i + 10).map((id) => row(id, 0)));
      }

      const queries = await collectQueries(() =>
        Wide.query(knex).upsertGraph(ids.map((id) => row(id, id))),
      );
      // SQLite builds before 3.32 bind 999 values at most:
      const maxBindings = session.isSqlite()
        ? 999
        : session.isMsSql()
          ? 2100
          : session.isPostgres()
            ? 65535
            : Infinity;

      expect(queries.every(({ bindings }) => bindings.length <= maxBindings)).toBe(true);

      const rows = await knex('graph_edge_wide').orderBy('id');
      expect(rows.every((row) => columns.every((column) => row[column] === row.id))).toBe(true);
    });
  });

  describe.skipIf(!session.isPostgres())('upsertGraph() patches that a trigger skips', () => {
    const { knex } = session;

    class Item extends Model {
      static get tableName() {
        return 'graph_edge_item';
      }
    }

    beforeAll(async () => {
      await knex.schema.dropTableIfExists('graph_edge_item');
      await knex.schema.createTable('graph_edge_item', (table) => {
        table.integer('id').primary();
        table.string('name');
      });
      await knex.raw(`
        create or replace function graph_edge_skip() returns trigger as $$
        begin
          if new.name = 'skip' then
            return null;
          end if;
          return new;
        end;
        $$ language plpgsql
      `);
      await knex.raw(`
        create trigger graph_edge_skip before update on graph_edge_item
        for each row execute function graph_edge_skip()
      `);
    });

    afterAll(async () => {
      await knex.schema.dropTableIfExists('graph_edge_item');
      await knex.raw('drop function if exists graph_edge_skip');
    });

    it('should not throw for rows that exist', async () => {
      await knex('graph_edge_item').insert([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]);

      await Item.query(knex).upsertGraph([
        { id: 1, name: 'skip' },
        { id: 2, name: 'c' },
      ]);

      expect(await knex('graph_edge_item').orderBy('id')).toEqual([
        { id: 1, name: 'a' },
        { id: 2, name: 'c' },
      ]);
    });
  });
};
