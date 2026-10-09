const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  describe('insertGraph / upsertGraph with cyclic #ref dependencies #1482', () => {
    const { knex } = session;
    let Person;
    let Pet;
    let Toy;

    before(() => {
      return knex.schema
        .dropTableIfExists('cyclic_toy')
        .dropTableIfExists('cyclic_pet')
        .dropTableIfExists('cyclic_person')
        .createTable('cyclic_person', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('favoritePetId').unsigned();
          table.integer('favoriteToyId').unsigned();
          table.string('favoritePetName');
        })
        .createTable('cyclic_pet', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('ownerId').unsigned().references('cyclic_person.id');
        })
        .createTable('cyclic_toy', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('petId').unsigned().references('cyclic_pet.id');
        })
        .then(() => {
          return knex.schema.alterTable('cyclic_person', (table) => {
            table.foreign('favoritePetId').references('cyclic_pet.id');
            table.foreign('favoriteToyId').references('cyclic_toy.id');
          });
        });
    });

    after(() => {
      return knex.schema
        .alterTable('cyclic_person', (table) => {
          table.dropForeign('favoritePetId');
          table.dropForeign('favoriteToyId');
        })
        .catch(() => {
          // SQLite doesn't support dropping foreign keys this way.
        })
        .then(() => {
          return knex.schema
            .dropTableIfExists('cyclic_toy')
            .dropTableIfExists('cyclic_pet')
            .dropTableIfExists('cyclic_person');
        });
    });

    before(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'cyclic_person';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: {
                from: 'cyclic_person.id',
                to: 'cyclic_pet.ownerId',
              },
            },

            favoritePet: {
              relation: Model.BelongsToOneRelation,
              modelClass: Pet,
              join: {
                from: 'cyclic_person.favoritePetId',
                to: 'cyclic_pet.id',
              },
            },

            favoriteToy: {
              relation: Model.BelongsToOneRelation,
              modelClass: Toy,
              join: {
                from: 'cyclic_person.favoriteToyId',
                to: 'cyclic_toy.id',
              },
            },
          };
        }
      };

      Pet = class Pet extends Model {
        static get tableName() {
          return 'cyclic_pet';
        }

        static get relationMappings() {
          return {
            toys: {
              relation: Model.HasManyRelation,
              modelClass: Toy,
              join: {
                from: 'cyclic_pet.id',
                to: 'cyclic_toy.petId',
              },
            },
          };
        }
      };

      Toy = class Toy extends Model {
        static get tableName() {
          return 'cyclic_toy';
        }
      };

      Person.knex(knex);
      Pet.knex(knex);
      Toy.knex(knex);
    });

    beforeEach(async () => {
      await Person.query().patch({ favoritePetId: null, favoriteToyId: null });
      await Toy.query().delete();
      await Pet.query().delete();
      await Person.query().delete();
    });

    function fetchPerson(name) {
      return Person.query()
        .findOne({ name })
        .withGraphFetched('[pets(orderById).toys(orderById), favoritePet, favoriteToy]')
        .modifiers({ orderById: (builder) => builder.orderBy('id') });
    }

    for (const method of ['insertGraph', 'upsertGraph']) {
      describe(`${method}()`, () => {
        it('should insert a BelongsToOne #ref to a HasMany sibling (issue example)', async () => {
          const result = await Person.query()[method](
            {
              name: 'Jennifer',
              pets: [{ name: 'Doggo' }, { '#id': 'felix', name: 'Felix' }],
              favoritePet: { '#ref': 'felix' },
            },
            { allowRefs: true },
          );

          const felix = result.pets[1];
          expect(felix.id).to.be.a('number');
          expect(felix.ownerId).to.equal(result.id);
          expect(result.favoritePetId).to.equal(felix.id);

          const jennifer = await fetchPerson('Jennifer');
          expect(jennifer.pets.map((it) => it.name)).to.eql(['Doggo', 'Felix']);
          expect(jennifer.favoritePet.name).to.equal('Felix');
          expect(jennifer.favoritePet.id).to.equal(felix.id);
        });

        it('should work when the #ref target is the first item of the relation', async () => {
          await Person.query()[method](
            {
              favoritePet: { '#ref': 'felix' },
              name: 'Jennifer',
              pets: [{ '#id': 'felix', name: 'Felix' }, { name: 'Doggo' }],
            },
            { allowRefs: true },
          );

          const jennifer = await fetchPerson('Jennifer');
          expect(jennifer.pets.map((it) => it.name)).to.eql(['Felix', 'Doggo']);
          expect(jennifer.favoritePet.name).to.equal('Felix');
        });

        it('should break cycles spanning more than two levels', async () => {
          const result = await Person.query()[method](
            {
              name: 'Jennifer',
              pets: [
                {
                  name: 'Felix',
                  toys: [{ name: 'Mouse' }, { '#id': 'ball', name: 'Ball' }],
                },
              ],
              favoriteToy: { '#ref': 'ball' },
            },
            { allowRefs: true },
          );

          expect(result.favoriteToyId).to.equal(result.pets[0].toys[1].id);

          const jennifer = await fetchPerson('Jennifer');
          expect(jennifer.favoriteToy.name).to.equal('Ball');
          expect(jennifer.pets[0].toys.map((it) => it.name)).to.eql(['Mouse', 'Ball']);
        });

        it('should break multiple cycles in one graph', async () => {
          await Person.query()[method](
            [
              {
                name: 'Jennifer',
                pets: [{ '#id': 'felix', name: 'Felix', toys: [{ '#id': 'ball', name: 'Ball' }] }],
                favoritePet: { '#ref': 'felix' },
                favoriteToy: { '#ref': 'ball' },
              },
              {
                name: 'Brad',
                pets: [{ name: 'Rex' }, { '#id': 'tom', name: 'Tom' }],
                favoritePet: { '#ref': 'tom' },
              },
            ],
            { allowRefs: true },
          );

          const jennifer = await fetchPerson('Jennifer');
          expect(jennifer.favoritePet.name).to.equal('Felix');
          expect(jennifer.favoriteToy.name).to.equal('Ball');

          const brad = await fetchPerson('Brad');
          expect(brad.favoritePet.name).to.equal('Tom');
          expect(brad.pets.map((it) => it.name)).to.eql(['Rex', 'Tom']);
        });

        it('should handle a #ref into another root without a cycle', async () => {
          await Person.query()[method](
            [
              {
                name: 'Jennifer',
                favoritePet: { '#ref': 'tom' },
              },
              {
                name: 'Brad',
                pets: [{ '#id': 'tom', name: 'Tom' }],
              },
            ],
            { allowRefs: true },
          );

          const jennifer = await fetchPerson('Jennifer');
          expect(jennifer.favoritePet.name).to.equal('Tom');
          expect(jennifer.pets).to.eql([]);
        });

        it('should still throw for cycles that only go through property references', async () => {
          let error;

          try {
            await Person.query()[method](
              {
                name: 'Jennifer',
                favoritePetName: '#ref{felix.name}',
                pets: [{ '#id': 'felix', name: 'Felix' }],
                '#id': 'jennifer',
              },
              { allowRefs: true },
            );
          } catch (err) {
            error = err;
          }

          // `favoritePetName` depends on felix, felix depends on jennifer
          // through the `pets` relation. Property references can't be deferred.
          expect(error).to.be.an('error');
          expect(error.message).to.equal('the object graph contains cyclic references');
          expect(await Person.query().resultSize()).to.equal(0);
        });
      });
    }

    describe('deferred updates', () => {
      let queries;
      const onQuery = (query) => queries.push(query.sql);

      beforeEach(() => {
        queries = [];
        knex.on('query', onQuery);
      });

      afterEach(() => {
        knex.removeListener('query', onQuery);
      });

      const countUpdates = () => queries.filter((sql) => /^update/i.test(sql)).length;

      it('should only patch the foreign keys of edges that were deferred', async () => {
        await Person.query().insertGraph(
          {
            name: 'Jennifer',
            pets: [{ '#id': 'felix', name: 'Felix', toys: [{ '#id': 'ball', name: 'Ball' }] }],
            favoritePet: { '#ref': 'felix' },
            favoriteToy: { '#ref': 'ball' },
          },
          { allowRefs: true },
        );

        expect(countUpdates()).to.equal(2);
      });

      it('should not patch anything if the graph has no cycles', async () => {
        await Person.query().insertGraph(
          [
            { name: 'Jennifer', favoritePet: { '#ref': 'tom' } },
            { name: 'Brad', pets: [{ '#id': 'tom', name: 'Tom' }] },
          ],
          { allowRefs: true },
        );

        expect(countUpdates()).to.equal(0);
      });
    });

    describe('upsertGraph() on an existing root', () => {
      it('should relate a new #ref target that is inserted as a child', async () => {
        const jennifer = await Person.query().insert({ name: 'Jennifer' });

        await Person.query().upsertGraph(
          {
            id: jennifer.id,
            pets: [{ '#id': 'felix', name: 'Felix' }],
            favoritePet: { '#ref': 'felix' },
          },
          { allowRefs: true },
        );

        const fetched = await fetchPerson('Jennifer');
        expect(fetched.pets.map((it) => it.name)).to.eql(['Felix']);
        expect(fetched.favoritePet.name).to.equal('Felix');
      });
    });
  });
};
