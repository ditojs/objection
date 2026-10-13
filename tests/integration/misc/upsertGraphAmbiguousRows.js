import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model, ValidationError } from 'objection';

export default (session) => {
  describe('insertGraph() and upsertGraph() with rows that the graph places in conflicting ways', () => {
    const { knex } = session;

    class Toy extends Model {
      static get tableName() {
        return 'ambiguous_toy';
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'ambiguous_pet';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ambiguous_pet.ownerId', to: 'ambiguous_person.id' },
          },
          ownerByCode: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ambiguous_pet.ownerCode', to: 'ambiguous_person.code' },
          },
          toys: {
            relation: Model.HasManyRelation,
            modelClass: Toy,
            join: { from: 'ambiguous_pet.id', to: 'ambiguous_toy.petId' },
          },
        };
      }
    }

    class Profile extends Model {
      static get tableName() {
        return 'ambiguous_profile';
      }

      static get relationMappings() {
        return {
          person: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ambiguous_profile.personId', to: 'ambiguous_person.id' },
          },
        };
      }
    }

    class Movie extends Model {
      static get tableName() {
        return 'ambiguous_movie';
      }

      static get relationMappings() {
        return {
          actors: {
            relation: Model.ManyToManyRelation,
            modelClass: Person,
            join: {
              from: 'ambiguous_movie.id',
              through: {
                from: 'ambiguous_person_movie.movieId',
                to: 'ambiguous_person_movie.personId',
                extra: ['role'],
              },
              to: 'ambiguous_person.id',
            },
          },
        };
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'ambiguous_person';
      }

      static get relationMappings() {
        return {
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ambiguous_person.parentId', to: 'ambiguous_person.id' },
          },
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'ambiguous_person.id', to: 'ambiguous_person.parentId' },
          },
          boss: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ambiguous_person.bossId', to: 'ambiguous_person.id' },
          },
          petsByCode: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'ambiguous_person.code', to: 'ambiguous_pet.ownerCode' },
          },
          cats: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            filter: (query) => query.where('label', 'cat'),
            join: { from: 'ambiguous_person.id', to: 'ambiguous_pet.ownerId' },
          },
          dogs: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            filter: (query) => query.where('label', 'dog'),
            join: { from: 'ambiguous_person.id', to: 'ambiguous_pet.ownerId' },
          },
          favoriteCat: {
            relation: Model.HasOneRelation,
            modelClass: Pet,
            filter: (query) => query.where('label', 'cat'),
            join: { from: 'ambiguous_person.id', to: 'ambiguous_pet.ownerId' },
          },
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'ambiguous_person.id', to: 'ambiguous_pet.ownerId' },
          },
          profile: {
            relation: Model.HasOneRelation,
            modelClass: Profile,
            join: { from: 'ambiguous_person.id', to: 'ambiguous_profile.personId' },
          },
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'ambiguous_person.id',
              through: {
                from: 'ambiguous_person_movie.personId',
                to: 'ambiguous_person_movie.movieId',
                extra: ['role'],
              },
              to: 'ambiguous_movie.id',
            },
          },
        };
      }
    }

    class Item extends Model {
      static get tableName() {
        return 'ambiguous_item';
      }
    }

    class Owner extends Model {
      static get tableName() {
        return 'ambiguous_owner';
      }

      static get idColumn() {
        return ['a', 'b'];
      }

      static get relationMappings() {
        return {
          items: {
            relation: Model.HasManyRelation,
            modelClass: Item,
            join: {
              from: ['ambiguous_owner.a', 'ambiguous_owner.b'],
              to: ['ambiguous_item.oa', 'ambiguous_item.ob'],
            },
          },
        };
      }
    }

    const tables = {
      owner: 'ambiguous_owner',
      item: 'ambiguous_item',
      person: 'ambiguous_person',
      pet: 'ambiguous_pet',
      toy: 'ambiguous_toy',
      profile: 'ambiguous_profile',
      movie: 'ambiguous_movie',
      person_movie: 'ambiguous_person_movie',
    };

    beforeAll(async () => {
      for (const name of Object.values(tables)) {
        await knex.schema.dropTableIfExists(name);
      }

      await knex.schema
        .createTable(tables.person, (table) => {
          table.integer('id').primary();
          table.string('label');
          table.integer('parentId');
          table.integer('bossId');
          table.string('code');
        })
        .createTable(tables.pet, (table) => {
          table.integer('id').primary();
          table.string('label');
          table.integer('ownerId');
          table.string('ownerCode');
        })
        .createTable(tables.owner, (table) => {
          table.integer('a');
          table.integer('b');
          table.primary(['a', 'b']);
        })
        .createTable(tables.item, (table) => {
          table.integer('id').primary();
          table.integer('oa');
          table.integer('ob');
        })
        .createTable(tables.toy, (table) => {
          table.integer('id').primary();
          table.string('label');
          table.integer('petId');
        })
        .createTable(tables.profile, (table) => {
          table.integer('id').primary();
          table.string('label');
          table.integer('personId').unique();
        })
        .createTable(tables.movie, (table) => {
          table.integer('id').primary();
          table.string('label');
        })
        .createTable(tables.person_movie, (table) => {
          table.integer('personId');
          table.integer('movieId');
          table.string('role');
        });

      Person.knex(knex);
      Owner.knex(knex);
      Profile.knex(knex);
    });

    beforeEach(async () => {
      for (const name of Object.values(tables)) {
        await knex(name).delete();
      }
    });

    afterAll(async () => {
      for (const name of Object.values(tables)) {
        await knex.schema.dropTableIfExists(name);
      }
    });

    async function insertRows(rows) {
      for (const [table, tableRows] of Object.entries(rows)) {
        await knex(tables[table]).insert(tableRows);
      }
    }

    async function selectRows() {
      const rows = {};

      for (const [table, name] of Object.entries(tables)) {
        rows[table] = await knex(name).select();
      }

      return rows;
    }

    // Cases of the differential test against 3.x, where the versions write
    // different rows, and neither is defined:
    const cases = [
      {
        seed: 25,
        rows: {
          person: [{ id: 2 }, { id: 3 }, { id: 4 }],
          pet: [{ id: 3, ownerId: 2 }],
          movie: [{ id: 3 }],
          person_movie: [{ personId: 3, movieId: 3 }],
        },
        graph: [
          {
            id: 3,
            boss: {
              id: 2,
              children: [
                { id: 4, parent: null },
                { label: 'person-new2', movies: [{ id: 3 }] },
              ],
            },
            movies: [],
          },
        ],
        options: { allowRefs: true, relate: true, noInsert: true },
      },
      {
        seed: 66,
        rows: { person: [{ id: 1 }, { id: 2 }] },
        graph: {
          id: 2,
          children: [{ id: 1, parent: { label: 'person-new2' } }],
          movies: [{ id: 1 }],
        },
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 217,
        rows: { person: [{ id: 1 }, { id: 2 }], pet: [{ id: 1, ownerId: 1 }] },
        graph: [
          {
            label: 'person-new2',
            children: [
              {
                label: 'person-new3',
                children: [
                  { id: 1, pets: [{ '#ref': 'u6' }] },
                  { id: 2, parent: null },
                ],
              },
            ],
            pets: [{ id: 1, '#id': 'u6' }],
          },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 219,
        rows: { person: [{ id: 2 }], pet: [{ id: 1, ownerId: 1 }] },
        graph: [
          {
            id: 2,
            parent: {
              label: 'person-new12',
              pets: [{ id: 1, owner: { '#ref': 'u8' } }, { label: 'pet-new15' }],
            },
          },
          { label: 'person-new19', children: [{ label: 'person-new20', '#id': 'u8' }] },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 243,
        rows: {
          person: [{ id: 1 }, { id: 2, parentId: 1 }],
          person_movie: [{ personId: 1, movieId: 3 }],
        },
        graph: [
          {
            label: 'person-new1',
            children: [
              { label: 'person-new2', children: [{ id: 2, parent: { label: 'person-new3' } }] },
            ],
          },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 550,
        rows: {
          person: [{ id: 1 }, { id: 2 }],
          pet: [
            { id: 3, ownerId: 2 },
            { id: 4, ownerId: 2 },
          ],
          profile: [{ id: 2, personId: 2 }],
          person_movie: [{ personId: 1, movieId: 1 }],
        },
        graph: [{ id: 1, pets: [{ id: 4, owner: { label: 'person-new2' } }] }],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 578,
        rows: {
          person: [{ id: 1 }, { id: 3 }],
          pet: [{ id: 1, ownerId: 1 }],
          toy: [{ id: 1, petId: 1 }],
        },
        graph: [{ id: 1, pets: [{ id: 1, owner: { id: 3, pets: [] } }] }],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 799,
        rows: { person: [{ id: 5 }], pet: [{ id: 2, ownerId: 2 }], toy: [{ id: 2, petId: 2 }] },
        graph: { label: 'person-new1', pets: [{ id: 2, owner: { id: 5, pets: [] } }] },
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 803,
        rows: {
          person: [{ id: 1 }, { id: 2 }, { id: 3, parentId: 2 }],
          profile: [{ id: 1, personId: 1 }],
          person_movie: [{ personId: 2, movieId: 3 }],
        },
        graph: [
          {
            id: 1,
            children: [{ id: 3, parent: { label: 'person-new5' } }],
            pets: [{ label: 'pet-new8' }],
          },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 1105,
        rows: { person: [{ id: 2 }], profile: [{ id: 1, personId: 1 }] },
        graph: [
          {
            label: 'person-new1',
            children: [{ id: 2, parent: { label: 'person-new2' } }],
            profile: { id: 1 },
          },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 1192,
        rows: { person: [{ id: 1 }, { id: 2 }], pet: [{ id: 2, ownerId: 1 }] },
        graph: {
          id: 1,
          pets: [{ id: 2, toys: [{ '#ref': 'u1' }, { label: 'toy-new1', '#id': 'u1' }] }],
          boss: { id: 2, pets: [{ label: 'pet-new2', toys: [{ '#ref': 'u1' }] }] },
        },
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 1342,
        rows: { person: [{ id: 2 }], pet: [{ id: 1, ownerId: 2 }] },
        graph: { label: 'person-new1', pets: [{ id: 1, owner: { id: 2, pets: [] } }] },
        options: { allowRefs: true, relate: true, unrelate: true },
      },
      {
        seed: 1361,
        rows: { person: [{ id: 1 }, { id: 2 }, { id: 3 }], profile: [{ id: 1, personId: 1 }] },
        graph: [{ id: 2, children: [{ id: 1, children: [{ id: 3, parent: null }] }] }],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 180,
        rows: { person: [{ id: 4 }], pet: [{ id: 4, ownerId: 4 }] },
        graph: [{ label: 'person-new1', pets: [{ id: 4, owner: { id: 4, '#unrelate': true } }] }],
        options: { allowRefs: true, allowMarkers: true, relate: true },
      },
      {
        seed: 5051,
        rows: { person: [{ id: 1 }, { id: 2, parentId: 1 }], pet: [{ id: 1, ownerId: 1 }] },
        graph: [
          {
            label: 'person-new1',
            children: [
              {
                label: 'person-new2',
                children: [{ id: 2, parent: { label: 'person-new3' } }],
              },
            ],
          },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 5056,
        rows: {
          person: [{ id: 3 }, { id: 5, parentId: 3 }],
          pet: [{ id: 3, ownerId: 3 }],
          profile: [{ id: 2, personId: 3 }],
        },
        graph: { label: 'person-new1', children: [{ id: 5, parent: { label: 'person-new7' } }] },
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 5057,
        rows: { pet: [{ id: 3, ownerId: 4 }] },
        graph: {
          label: 'person-new1',
          pets: [{ id: 3, owner: { label: 'person-new13' } }, { label: 'pet-new19' }],
        },
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 5062,
        rows: { person: [{ id: 2 }], pet: [{ id: 1, ownerId: 2 }] },
        graph: [
          {
            label: 'person-new6',
            pets: [{ id: 1, owner: { '#dbRef': 1 } }, { label: 'pet-new8' }],
          },
        ],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 5195,
        rows: { person: [{ id: 2 }, { id: 4 }], pet: [{ id: 1, ownerId: 2 }] },
        graph: [{ id: 2, children: [{ id: 4, parent: null }] }],
        options: { allowRefs: true, relate: true },
      },
      {
        seed: 'b3-third-owner',
        rows: { person: [{ id: 1 }, { id: 2 }], pet: [{ id: 4, ownerId: 2 }] },
        graph: { id: 1, pets: [{ id: 4, owner: { label: 'new-owner' } }] },
        options: { allowRefs: true, relate: true },
      },
    ];

    for (const { seed, rows, graph, options } of cases) {
      it(`should reject the graph before any write (${seed})`, async () => {
        await insertRows(rows);
        const before = await selectRows();

        const err = await Person.query()
          .upsertGraph(graph, options)
          .catch((err) => err);

        expect(err).toBeInstanceOf(ValidationError);
        expect(err.type).toBe('InvalidGraph');
        expect(await selectRows()).toEqual(before);
      });
    }

    // The cases of the differential test, in a small graph:
    for (const [title, graph] of [
      [
        'under two owners',
        [
          { id: 1, pets: [{ id: 1 }] },
          { id: 3, pets: [{ id: 1 }] },
        ],
      ],
      [
        'under an owner and its inverse to another model',
        { id: 1, pets: [{ id: 1, owner: { id: 3 } }] },
      ],
      ['with an inverse to a new model', { id: 1, pets: [{ id: 1, owner: { label: 'new' } }] }],
      [
        'with conflicting values',
        [
          { id: 2, pets: [{ id: 1, label: 'x' }] },
          { id: 2, pets: [{ id: 1, label: 'y' }] },
        ],
      ],
    ]) {
      it(`should reject a row ${title}`, async () => {
        await insertRows({
          person: [{ id: 1 }, { id: 2 }, { id: 3 }],
          pet: [{ id: 1, ownerId: 2 }],
        });

        const err = await Person.query()
          .upsertGraph(graph, { relate: true })
          .catch((err) => err);

        expect(err).toBeInstanceOf(ValidationError);
        expect(err.type).toBe('InvalidGraph');
        expect(await knex(tables.pet).select('id', 'label', 'ownerId')).toEqual([
          { id: 1, label: null, ownerId: 2 },
        ]);
      });
    }

    it('should reject rows that one place removes and another one keeps', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }], pet: [{ id: 3, ownerId: 1 }] });

      for (const [graph, message] of [
        [
          [
            { id: 1, pets: [{ id: 3, '#delete': true }] },
            { id: 1, pets: [{ id: 3, label: 'x' }] },
          ],
          "the graph gives #delete of one Pet two values, at '[0].pets[0]' and at '[1].pets[0]'",
        ],
        [
          [
            { id: 1, pets: [{ id: 3, '#delete': true }] },
            { id: 2, pets: [{ id: 3 }] },
          ],
          "the graph gives #delete of one Pet two values, at '[0].pets[0]' and at '[1].pets[0]'",
        ],
        [
          [
            { id: 1, pets: [{ id: 3, '#unrelate': true }] },
            { id: 2, pets: [{ id: 3 }] },
          ],
          "the graph gives ownerId of one Pet two values, at '[0].pets[0]' and at '[1].pets[0]'",
        ],
      ]) {
        await expect(
          Person.query().upsertGraph(graph, { relate: true, allowMarkers: true }),
        ).rejects.toThrow(message);
        expect(await knex(tables.pet).select('id', 'ownerId')).toEqual([{ id: 3, ownerId: 1 }]);
      }
    });

    it('should reject a many-to-many pair that one place unrelates and another one keeps (#405)', async () => {
      await insertRows({
        person: [{ id: 1 }],
        movie: [{ id: 3 }],
        person_movie: [{ personId: 1, movieId: 3, role: 'x' }],
      });

      const unrelated = { id: 3, '#id': 'm', '#unrelate': true, role: 'a' };
      for (const graph of [
        { id: 1, movies: [unrelated, { '#ref': 'm', role: 'b' }] },
        { id: 1, movies: [{ '#ref': 'm', role: 'b' }, unrelated] },
        [
          { id: 1, movies: [{ id: 3, '#unrelate': true }] },
          { id: 1, movies: [{ id: 3 }] },
        ],
        [
          { id: 1, movies: [{ id: 3 }] },
          { id: 1, movies: [{ id: 3, '#unrelate': true }] },
        ],
        // The inverse relation places the same pair:
        { id: 1, movies: [{ id: 3, '#unrelate': true, actors: [{ id: 1 }] }] },
      ]) {
        await expect(
          Person.query().upsertGraph(graph, { relate: true, allowRefs: true, allowMarkers: true }),
        ).rejects.toThrow(
          /the graph gives #unrelate of one join row of (movies|actors) two values/,
        );
      }

      expect(await knex(tables.person_movie).select('personId', 'movieId', 'role')).toEqual([
        { personId: 1, movieId: 3, role: 'x' },
      ]);
    });

    it('should reject a row that insertGraph() places in conflicting ways', async () => {
      await expect(
        Person.query().insertGraph({
          id: 1,
          label: 'a',
          pets: [{ id: 1, owner: { id: 2, label: 'b' } }],
        }),
      ).rejects.toThrow(
        "the graph gives ownerId of one Pet two values, at 'pets[0]' and at 'pets[0].owner'",
      );
      expect(await knex(tables.person)).toEqual([]);
    });

    it('should reject a foreign key prop that another place gives a relation key', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }, { id: 5 }] });

      for (const graph of [
        [
          { id: 1, children: [{ id: 2 }] },
          { id: 2, parentId: 5 },
        ],
        [
          { id: 2, parentId: 5 },
          { id: 1, children: [{ id: 2 }] },
        ],
        [
          { id: 2, parent: { id: 1 } },
          { id: 2, parentId: 5 },
        ],
      ]) {
        await expect(Person.query().upsertGraph(graph, { relate: true })).rejects.toThrow(
          /the graph gives parentId of one Person two values/,
        );
      }

      expect(await knex(tables.person).where('id', 2).first()).toMatchObject({ parentId: null });
    });

    it('should let a relation set the foreign key that the same model gives', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }, { id: 5 }] });

      await Person.query().upsertGraph({ id: 2, parentId: 5, parent: { id: 1 } }, { relate: true });

      expect(await knex(tables.person).where('id', 2).first()).toMatchObject({ parentId: 1 });
    });

    it('should reject two rows in the slot of a HasOneRelation', async () => {
      await insertRows({ person: [{ id: 1 }], profile: [{ id: 5 }, { id: 6 }] });

      for (const graph of [
        [
          { id: 1, profile: { id: 5 } },
          { id: 1, profile: { id: 6 } },
        ],
        [
          { id: 1, profile: { id: 6 } },
          { id: 1, profile: { id: 5 } },
        ],
        [
          { id: 1, profile: null },
          { id: 1, profile: { id: 5 } },
        ],
      ]) {
        await expect(Person.query().upsertGraph(graph, { relate: true })).rejects.toThrow(
          /the graph puts two Profile rows in profile of one Person/,
        );
      }

      // Rows that the graph gives the key of the slot without the relation:
      for (const graph of [
        [
          { id: 5, personId: 1 },
          { id: 6, person: { id: 1, profile: { id: 6 } } },
        ],
        { id: 5, person: { id: 1, profile: { id: 6 } } },
        { id: 5, person: { id: 1, profile: null } },
      ]) {
        await expect(Profile.query().upsertGraph(graph, { relate: true })).rejects.toThrow(
          /the graph puts two Profile rows in profile of one Person/,
        );
      }

      expect(await knex(tables.profile).select('id', 'personId')).toEqual([
        { id: 5, personId: null },
        { id: 6, personId: null },
      ]);
    });

    it('should accept a key that the graph gives as a string and a number', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }] });

      await Person.query().upsertGraph(
        [
          { id: 1, children: [{ id: 2 }] },
          { id: 2, parentId: '1' },
        ],
        { relate: true },
      );

      expect(await knex(tables.person).where('id', 2).first()).toMatchObject({ parentId: 1 });
    });

    it('should accept rows of the same key outside the slot of a relation that filters its rows', async () => {
      await insertRows({
        person: [{ id: 1 }],
        pet: [
          { id: 1, label: 'cat', ownerId: 1 },
          { id: 2, label: 'dog', ownerId: 1 },
        ],
      });

      await Person.query().upsertGraph({ id: 1, favoriteCat: { id: 1 }, dogs: [{ id: 2 }] });

      expect(await knex(tables.pet).select('id', 'ownerId')).toEqual([
        { id: 1, ownerId: 1 },
        { id: 2, ownerId: 1 },
      ]);
    });

    it('should reject one row with two values for a prop', async () => {
      await insertRows({ person: [{ id: 3 }], pet: [{ id: 2, ownerId: 3 }] });

      await expect(
        Person.query().upsertGraph([
          { id: 3, pets: [{ id: 2, label: 'a' }] },
          { id: 3, pets: [{ id: 2, label: 'b' }] },
        ]),
      ).rejects.toThrow(
        "the graph gives label of one Pet two values, at '[0].pets[0].label' and at '[1].pets[0].label'",
      );
    });

    // A row that the graph keeps in one place isn't removed from another one,
    // so these graphs have a defined outcome:
    it('should keep a row that one place of its owner lists and another leaves out', async () => {
      await insertRows({ person: [{ id: 2 }, { id: 3 }], pet: [{ id: 2, ownerId: 3 }] });

      for (const graph of [
        [
          { id: 3, pets: [{ id: 2 }] },
          { id: 3, pets: [] },
        ],
        [
          { id: 3, pets: [] },
          { id: 3, pets: [{ id: 2 }] },
        ],
      ]) {
        await Person.query().upsertGraph(graph);
        expect(await knex(tables.pet).select('id', 'ownerId')).toEqual([{ id: 2, ownerId: 3 }]);
      }
    });

    it('should keep a row that a model places under a parent whose children leave it out', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 3 }] });

      await Person.query().upsertGraph(
        { id: 3, parent: { id: 1, children: [] } },
        { relate: true },
      );

      expect(await knex(tables.person).select('id', 'parentId').orderBy('id')).toEqual([
        { id: 1, parentId: null },
        { id: 3, parentId: 1 },
      ]);
    });

    it('should reject a row under two owners through the same key', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }], pet: [{ id: 3, ownerId: 1 }] });

      await expect(
        Person.query().upsertGraph(
          [
            { id: 1, pets: [{ id: 3 }] },
            { id: 2, pets: [{ id: 3 }] },
          ],
          { relate: true },
        ),
      ).rejects.toThrow(
        "the graph gives ownerId of one Pet two values, at '[0].pets[0]' and at '[1].pets[0]'",
      );
    });

    it('should accept owners with composite keys that share a column', async () => {
      await insertRows({
        owner: [
          { a: 1, b: 1 },
          { a: 1, b: 2 },
        ],
        item: [
          { id: 1, oa: 1, ob: 1 },
          { id: 2, oa: 1, ob: 2 },
        ],
      });

      await Owner.query().upsertGraph([
        { a: 1, b: 1, items: [{ id: 1 }] },
        { a: 1, b: 2, items: [{ id: 2 }] },
      ]);

      expect(await knex(tables.item).orderBy('id')).toEqual([
        { id: 1, oa: 1, ob: 1 },
        { id: 2, oa: 1, ob: 2 },
      ]);
    });

    it('should accept a row placed the same way twice through a key that is not the id', async () => {
      await insertRows({ person: [{ id: 1, code: 'x' }], pet: [{ id: 1, ownerCode: 'x' }] });

      await Person.query().upsertGraph(
        { id: 1, code: 'x', petsByCode: [{ id: 1, ownerByCode: { id: 1 } }] },
        { relate: true },
      );

      expect(await knex(tables.pet).select('id', 'ownerCode')).toEqual([{ id: 1, ownerCode: 'x' }]);
    });

    it('should accept rows of relations that filter the rows of the same key', async () => {
      await insertRows({
        person: [{ id: 1 }],
        pet: [
          { id: 1, label: 'cat', ownerId: 1 },
          { id: 2, label: 'dog', ownerId: 1 },
        ],
      });

      await Person.query().upsertGraph({ id: 1, cats: [{ id: 1 }], dogs: [{ id: 2 }] });
      await Person.query().upsertGraph({ id: 1, cats: [{ id: 1 }], dogs: [] });

      expect(await knex(tables.pet).select('id')).toEqual([{ id: 1 }]);
    });

    it('should accept a row placed the same way twice', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }], pet: [{ id: 3, ownerId: 2 }] });

      await Person.query().upsertGraph(
        { id: 1, pets: [{ id: 3, owner: { id: 1, pets: [{ id: 3, label: 'x' }] } }] },
        { relate: true },
      );

      expect(await knex(tables.pet).select('id', 'label', 'ownerId')).toEqual([
        { id: 3, label: 'x', ownerId: 1 },
      ]);
    });

    it('should accept a row in places that write different columns', async () => {
      await insertRows({ person: [{ id: 1 }, { id: 2 }] });

      await Person.query().upsertGraph(
        { id: 1, children: [{ id: 2 }], boss: { id: 2 } },
        { relate: true },
      );

      expect(
        await knex(tables.person).select('id', 'label', 'parentId', 'bossId').orderBy('id'),
      ).toEqual([
        { id: 1, label: null, parentId: null, bossId: 2 },
        { id: 2, label: null, parentId: 1, bossId: null },
      ]);
    });
  });
};
