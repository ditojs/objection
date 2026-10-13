import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';
import mockKnexFactory from '../../testUtils/mockKnex.js';

export default (session) => {
  describe('static model hooks', () => {
    let knex;
    let queries = [];

    let Person;
    let Pet;
    let Movie;

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('actorsMovies')
        .dropTableIfExists('movies')
        .dropTableIfExists('pets')
        .dropTableIfExists('people')
        .createTable('people', (table) => {
          table.increments('id').primary();
          table.string('name');
        })
        .createTable('pets', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.string('species');
          table.integer('ownerId').unsigned().references('people.id').onDelete('SET NULL');
        })
        .createTable('movies', (table) => {
          table.increments('id').primary();
          table.string('name');
        })
        .createTable('actorsMovies', (table) => {
          table.increments('id').primary();
          table.integer('personId').unsigned().references('people.id').onDelete('CASCADE');
          table.integer('movieId').unsigned().references('movies.id').onDelete('CASCADE');
        });
    });

    afterAll(() => {
      return session.knex.schema
        .dropTableIfExists('actorsMovies')
        .dropTableIfExists('movies')
        .dropTableIfExists('pets')
        .dropTableIfExists('people');
    });

    beforeAll(() => {
      knex = mockKnexFactory(session.knex, function (_, oldImpl, args) {
        queries.push(this.toSQL());
        return oldImpl.apply(this, args);
      });
    });

    beforeEach(() => {
      Person = class extends Model {
        static get tableName() {
          return 'people';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: {
                from: 'people.id',
                to: 'pets.ownerId',
              },
            },

            movies: {
              relation: Model.ManyToManyRelation,
              modelClass: Movie,
              join: {
                from: 'people.id',
                through: {
                  from: 'actorsMovies.personId',
                  to: 'actorsMovies.movieId',
                },
                to: 'movies.id',
              },
            },
          };
        }
      };

      Pet = class extends Model {
        static get tableName() {
          return 'pets';
        }

        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Person,
              join: {
                from: 'pets.ownerId',
                to: 'people.id',
              },
            },
          };
        }
      };

      Movie = class extends Model {
        static get tableName() {
          return 'movies';
        }

        static get relationMappings() {
          return {
            actors: {
              relation: Model.ManyToManyRelation,
              modelClass: Person,
              join: {
                from: 'movies.id',
                through: {
                  from: 'actorsMovies.movieId',
                  to: 'actorsMovies.personId',
                },
                to: 'people.id',
              },
            },
          };
        }
      };

      Person.knex(knex);
      Pet.knex(knex);
      Movie.knex(knex);
    });

    beforeEach(() => {
      return Movie.query()
        .delete()
        .then(() => Pet.query().delete())
        .then(() => Person.query().delete());
    });

    describe('onCreateQuery', () => {
      describe('default selects', () => {
        beforeEach(() => {
          Person.onCreateQuery = (query) => {
            query.select('people.name');
          };

          Pet.onCreateQuery = (query) => {
            query.select('pets.name');
          };

          Movie.onCreateQuery = (query) => {
            query.select('movies.name');
          };
        });

        beforeEach(() => {
          return Person.query().insertGraph({
            name: 'Jennifer',

            pets: [
              {
                name: 'Doggo',
                species: 'dog',
              },
              {
                name: 'Cato',
                species: 'cat',
              },
            ],

            movies: [
              {
                name: 'Silver Linings Playbook',
              },
            ],
          });
        });

        it('should work with a simple query', () => {
          return Person.query()
            .findOne('name', 'Jennifer')
            .then((result) => {
              expect(result).toEqual({
                name: 'Jennifer',
              });
            });
        });

        it('should work with updates', () => {
          return Person.query()
            .findOne('name', 'Jennifer')
            .patch({ name: 'Jennier II' })
            .then((result) => {
              expect(result).toBe(1);
            });
        });

        it('should work with inserts', () => {
          return Person.query()
            .insert({ name: 'Jennier II' })
            .then((result) => {
              expect(result.id).toBeTypeOf('number');
            });
        });

        it('should work with deletes', () => {
          return Person.query()
            .findOne('name', 'Jennifer')
            .delete()
            .then((result) => {
              expect(result).toBe(1);
            });
        });

        it('should work with eager', () => {
          return Person.query()
            .findOne('name', 'Jennifer')
            .withGraphFetched({
              movies: true,
              pets: {
                owner: true,
              },
            })
            .modifyGraph('pets', (query) => query.orderBy('name', 'desc'))
            .then((result) => {
              expect(result).toEqual({
                name: 'Jennifer',
                pets: [
                  {
                    name: 'Doggo',
                    owner: {
                      name: 'Jennifer',
                    },
                  },
                  {
                    name: 'Cato',
                    owner: {
                      name: 'Jennifer',
                    },
                  },
                ],
                movies: [
                  {
                    name: 'Silver Linings Playbook',
                  },
                ],
              });
            });
        });

        it('should work with joinEager', () => {
          return Person.query()
            .findOne('people.name', 'Jennifer')
            .withGraphJoined({
              movies: true,
              pets: {
                owner: true,
              },
            })
            .orderBy('pets.name', 'desc')
            .then((result) => {
              expect(result).toEqual({
                name: 'Jennifer',
                pets: [
                  {
                    name: 'Doggo',
                    owner: {
                      name: 'Jennifer',
                    },
                  },
                  {
                    name: 'Cato',
                    owner: {
                      name: 'Jennifer',
                    },
                  },
                ],
                movies: [
                  {
                    name: 'Silver Linings Playbook',
                  },
                ],
              });
            });
        });
      });
    });

    describe('beforeFind', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called before normal queries', () => {
          Movie.beforeFind = createHookSpy();

          return Movie.query().then((movies) => {
            expect(movies.length).toBe(2);

            expect(movies).toContainSubset([
              {
                name: 'Silver Linings Playbook',
              },
              {
                name: 'Hungergames',
              },
            ]);

            expect(Movie.beforeFind.calls.length).toBe(1);
          });
        });

        it('can be async', () => {
          Movie.beforeFind = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query().then((movies) => {
            expect(movies.length).toBe(2);

            expect(movies).toContainSubset([
              {
                name: 'Silver Linings Playbook',
              },
              {
                name: 'Hungergames',
              },
            ]);

            expect(Movie.beforeFind.calls.length).toBe(1);
            expect(Movie.beforeFind.calls[0].itWorked).toBe(true);
          });
        });

        it('should have access to `context`', () => {
          Movie.beforeFind = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .context({ a: 1 })
            .then(() => {
              expect(Movie.beforeFind.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.beforeFind = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query().then(() => {
            expect(Movie.beforeFind.calls.length).toBe(1);
          });
        });

        it('should get an undefined `result`', async () => {
          Movie.beforeFind = createHookSpy();

          await Movie.query();
          expect(Movie.beforeFind.calls[0].args.result).toBeUndefined();
        });

        it('should be able to cancel the query', () => {
          Movie.beforeFind = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });

          return Movie.query().then((result) => {
            expect(result).toEqual([]);
            expect(queries.length).toBe(0);
          });
        });

        it('should be able to cancel the query with a value', () => {
          Movie.beforeFind = createHookSpy(({ cancelQuery }) => {
            cancelQuery(['lol']);
          });

          return Movie.query().then((result) => {
            expect(result).toEqual(['lol']);
            expect(queries.length).toBe(0);
          });
        });
      });

      describe('$query', () => {
        it('should have access to `items`', () => {
          return Movie.query()
            .findOne({ name: 'Hungergames' })
            .then((movie) => {
              Movie.beforeFind = createHookSpy(({ items }) => {
                expect(items.length).toBe(1);

                expect(items).toContainSubset([
                  {
                    name: 'Hungergames',
                  },
                ]);
              });

              return movie.$query();
            })
            .then((result) => {
              expect(result.name).toBe('Hungergames');
              expect(Movie.beforeFind.calls.length).toBe(1);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.beforeFind = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies');
              })
              .then((movies) => {
                expect(movies.length).toBe(2);

                expect(movies).toContainSubset([
                  {
                    name: 'Silver Linings Playbook',
                  },
                  {
                    name: 'Hungergames',
                  },
                ]);

                expect(Movie.beforeFind.calls.length).toBe(1);
              });
          });
        });

        describe('has many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.beforeFind = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets');
              })
              .then((pets) => {
                expect(pets.length).toBe(2);

                expect(pets).toContainSubset([
                  {
                    name: 'Doggo',
                    species: 'dog',
                  },
                  {
                    name: 'Cato',
                    species: 'cat',
                  },
                ]);

                expect(Pet.beforeFind.calls.length).toBe(1);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation` and `items`', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.beforeFind = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner');
              })
              .then((person) => {
                expect(person).toMatchObject({
                  name: 'Jennifer',
                });

                expect(Person.beforeFind.calls.length).toBe(1);
              });
          });
        });
      });

      describe('eager', () => {
        it('should have access to all parents and relation', () => {
          Pet.beforeFind = createHookSpy(({ items, relation }) => {
            expect(items.length).toBe(2);

            expect(items).toContainSubset([
              {
                name: 'Jennifer',
              },
              {
                name: 'Brad',
              },
            ]);

            expect(relation).toBe(Person.getRelation('pets'));
          });

          Person.beforeFind = createHookSpy(({ items, relation }) => {
            // Ignore the first call (root query).
            if (Person.beforeFind.calls.length === 1) {
              return;
            }

            expect(items.length).toBe(4);
            expect(items).toContainSubset([
              {
                name: 'Doggo',
              },
              {
                name: 'Cato',
              },
              {
                name: 'Jamie',
              },
              {
                name: 'Rob',
              },
            ]);

            expect(relation).toBe(Pet.getRelation('owner'));
          });

          Movie.beforeFind = createHookSpy(({ items, relation }) => {
            expect(items.length).toBe(2);

            expect(items).toContainSubset([
              {
                name: 'Jennifer',
              },
              {
                name: 'Brad',
              },
            ]);

            expect(relation).toBe(Person.getRelation('movies'));
          });

          return Person.query()
            .withGraphFetched({
              movies: true,
              pets: {
                owner: true,
              },
            })
            .then(() => {
              expect(Movie.beforeFind.calls.length).toBe(1);
              expect(Pet.beforeFind.calls.length).toBe(1);
              expect(Person.beforeFind.calls.length).toBe(2);
            });
        });
      });
    });

    describe('afterFind', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      describe('query', () => {
        it('should be called before normal queries', () => {
          Movie.afterFind = createHookSpy();

          return Movie.query().then((movies) => {
            expect(movies.length).toBe(2);

            expect(movies).toContainSubset([
              {
                name: 'Silver Linings Playbook',
              },
              {
                name: 'Hungergames',
              },
            ]);

            expect(Movie.afterFind.calls.length).toBe(1);
          });
        });

        it('should be able to change the result', () => {
          Movie.afterFind = createHookSpy(({ result }) => {
            return ['some', 'crap', result];
          });

          return Movie.query().then((result) => {
            expect(result).toContainSubset([
              'some',
              'crap',
              [
                {
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            ]);
            expect(Movie.afterFind.calls.length).toBe(1);
          });
        });

        it('can be async', () => {
          Movie.afterFind = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query().then((movies) => {
            expect(movies.length).toBe(2);

            expect(movies).toContainSubset([
              {
                name: 'Silver Linings Playbook',
              },
              {
                name: 'Hungergames',
              },
            ]);

            expect(Movie.afterFind.calls.length).toBe(1);
            expect(Movie.afterFind.calls[0].itWorked).toBe(true);
          });
        });

        it('should have access to `context`', () => {
          Movie.afterFind = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .context({ a: 1 })
            .then(() => {
              expect(Movie.afterFind.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.afterFind = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query().then(() => {
            expect(Movie.afterFind.calls.length).toBe(1);
          });
        });
      });

      describe('$query', () => {
        it('should have access to `items`', () => {
          return Movie.query()
            .findOne({ name: 'Hungergames' })
            .then((movie) => {
              Movie.afterFind = createHookSpy(({ items }) => {
                expect(items.length).toBe(1);

                expect(items).toContainSubset([
                  {
                    name: 'Hungergames',
                  },
                ]);
              });

              return movie.$query();
            })
            .then((result) => {
              expect(result.name).toBe('Hungergames');
              expect(Movie.afterFind.calls.length).toBe(1);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.afterFind = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies');
              })
              .then((movies) => {
                expect(movies.length).toBe(2);

                expect(movies).toContainSubset([
                  {
                    name: 'Silver Linings Playbook',
                  },
                  {
                    name: 'Hungergames',
                  },
                ]);

                expect(Movie.afterFind.calls.length).toBe(1);
              });
          });
        });

        describe('has many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.afterFind = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets');
              })
              .then((pets) => {
                expect(pets.length).toBe(2);

                expect(pets).toContainSubset([
                  {
                    name: 'Doggo',
                    species: 'dog',
                  },
                  {
                    name: 'Cato',
                    species: 'cat',
                  },
                ]);

                expect(Pet.afterFind.calls.length).toBe(1);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation` and `items`', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.afterFind = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner');
              })
              .then((person) => {
                expect(person).toMatchObject({
                  name: 'Jennifer',
                });

                expect(Person.afterFind.calls.length).toBe(1);
              });
          });

          it('should get an undefined `result` if there is no related model', async () => {
            const pet = await Pet.query().insert({ name: 'Stray' });
            Person.afterFind = createHookSpy();

            const owner = await pet.$relatedQuery('owner');
            expect(owner).toBeUndefined();
            expect(Person.afterFind.calls.length).toBe(1);
            expect(Person.afterFind.calls[0].args.result).toBeUndefined();
          });
        });
      });

      describe('eager', () => {
        it('should have access to all parents and relation', () => {
          Pet.afterFind = createHookSpy(({ items, relation }) => {
            expect(items.length).toBe(2);

            expect(items).toContainSubset([
              {
                name: 'Jennifer',
              },
              {
                name: 'Brad',
              },
            ]);

            expect(relation).toBe(Person.getRelation('pets'));
          });

          Person.afterFind = createHookSpy(({ items, relation }) => {
            // Ignore the last call (root query).
            if (Person.afterFind.calls.length === 2) {
              return;
            }

            expect(items.length).toBe(4);
            expect(items).toContainSubset([
              {
                name: 'Doggo',
              },
              {
                name: 'Cato',
              },
              {
                name: 'Jamie',
              },
              {
                name: 'Rob',
              },
            ]);

            expect(relation).toBe(Pet.getRelation('owner'));
          });

          Movie.afterFind = createHookSpy(({ items, relation }) => {
            expect(items.length).toBe(2);

            expect(items).toContainSubset([
              {
                name: 'Jennifer',
              },
              {
                name: 'Brad',
              },
            ]);

            expect(relation).toBe(Person.getRelation('movies'));
          });

          return Person.query()
            .withGraphFetched({
              movies: true,
              pets: {
                owner: true,
              },
            })
            .then(() => {
              expect(Movie.afterFind.calls.length).toBe(1);
              expect(Pet.afterFind.calls.length).toBe(1);
              expect(Person.afterFind.calls.length).toBe(2);
            });
        });
      });
    });

    describe('beforeUpdate', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
                {
                  name: 'A Star is Born',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called before normal queries', () => {
          Movie.beforeUpdate = createHookSpy();

          return Movie.query()
            .update({ name: 'Updated' })
            .then((numUpdated) => {
              expect(numUpdated).toBe(3);
              expect(Movie.beforeUpdate.calls.length).toBe(1);
            });
        });

        it('can be async', () => {
          Movie.beforeUpdate = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then((numUpdated) => {
              expect(numUpdated).toBe(3);
              expect(Movie.beforeUpdate.calls.length).toBe(1);
              expect(Movie.beforeUpdate.calls[0].itWorked).toBe(true);
            });
        });

        it('should have access to `context`', () => {
          Movie.beforeUpdate = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .context({ a: 1 })
            .then(() => {
              expect(Movie.beforeUpdate.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.beforeUpdate = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then(() => {
              expect(Movie.beforeUpdate.calls.length).toBe(1);
            });
        });

        it('should have access to `inputItems`', () => {
          Movie.beforeUpdate = createHookSpy(({ inputItems }) => {
            expect(inputItems.length).toBe(1);
            expect(inputItems[0] instanceof Movie).toBe(true);
            expect(inputItems).toContainSubset([
              {
                name: 'Updated',
              },
            ]);
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then(() => {
              expect(Movie.beforeUpdate.calls.length).toBe(1);
            });
        });

        it('should be able to fetch the rows about to be updated', () => {
          Movie.beforeUpdate = createHookSpy(({ asFindQuery }, call) => {
            return asFindQuery()
              .select('name')
              .forUpdate()
              .then((moviesToBeUpdated) => {
                expect(moviesToBeUpdated).toHaveLength(1);
                expect(moviesToBeUpdated).toContainSubset([
                  {
                    name: 'Hungergames',
                  },
                ]);
                call.queryWasAwaited = true;
              });
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .where('name', 'like', '%gam%')
            .then(() => {
              expect(Movie.beforeUpdate.calls.length).toBe(1);
              expect(Movie.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
              expect(queries.length).toBe(2);
            });
        });

        it('should be able to fetch the rows about to be updated when using pacthAndFetchById', async () => {
          Movie.beforeUpdate = createHookSpy(async ({ asFindQuery }, call) => {
            const moviesToBeUpdated = await asFindQuery().select('name').forUpdate();

            expect(moviesToBeUpdated).toHaveLength(1);
            expect(moviesToBeUpdated).toContainSubset([
              {
                name: 'Hungergames',
              },
            ]);

            call.queryWasAwaited = true;
          });

          const hungerGames = await Movie.query().findOne('name', 'like', '%gam%');
          expect(queries.length).toBe(1);

          await Movie.query().patchAndFetchById(hungerGames.id, { name: 'Updated' });
          expect(Movie.beforeUpdate.calls.length).toBe(1);
          expect(Movie.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
          // findOne + patch + fetch + asFindQuery()
          expect(queries.length).toBe(4);
        });

        it('should be able to access modelOptions in beforeUpdate when using patchAndFetchById', async () => {
          Movie.beforeUpdate = createHookSpy(({ modelOptions }) => {
            expect(modelOptions).toEqual({ patch: true });
          });

          const hungerGames = await Movie.query().findOne('name', 'like', '%gam%');
          expect(queries.length).toBe(1);

          await Movie.query().patchAndFetchById(hungerGames.id, { name: 'Updated' });
          expect(Movie.beforeUpdate.calls.length).toBe(1);
        });

        it('should populate modelOptions with old data when using upsertGraph', async () => {
          Movie.beforeUpdate = createHookSpy(({ modelOptions }) => {
            expect(modelOptions).toHaveProperty('old');

            expect(modelOptions.old).toMatchObject({ name: 'Hungergames' });
          });

          const hungerGames = await Movie.query().findOne('name', 'like', '%gam%');
          expect(queries.length).toBe(1);

          await Movie.query().upsertGraph({ id: hungerGames.id, name: 'Updated' });
          expect(Movie.beforeUpdate.calls.length).toBe(1);
        });

        it('should be able to cancel the query', () => {
          Movie.beforeUpdate = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then((numUpdated) => {
              expect(numUpdated).toBe(0);
              expect(queries.length).toBe(0);
            });
        });

        it('should be able to cancel the queries of upsertGraph', async () => {
          Pet.beforeUpdate = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });

          const person = await Person.query()
            .findOne({ name: 'Jennifer' })
            .withGraphFetched('pets');
          const pets = person.pets.map(({ id, name }) => ({ id, name: `${name} 2` }));
          const result = await Person.query().upsertGraph({ id: person.id, pets });

          expect(result.pets).toHaveLength(2);
          expect(Pet.beforeUpdate.calls.length).toBe(2);
          const current = await person.$relatedQuery('pets').orderBy('name');
          expect(current.map((pet) => pet.name)).toEqual(['Cato', 'Doggo']);
        });

        it('should be able to cancel the queries of upsertGraph through relations', async () => {
          Movie.beforeUpdate = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });
          Person.beforeUpdate = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });

          const person = await Person.query()
            .findOne({ name: 'Jennifer' })
            .withGraphFetched('[movies, pets]');
          const [pet] = person.pets;
          const movies = person.movies.map(({ id, name }) => ({ id, name: `${name} 2` }));

          await Person.query().upsertGraph({ id: person.id, movies });
          await Pet.query().upsertGraph({ id: pet.id, owner: { id: person.id, name: 'Jen' } });

          expect(Movie.beforeUpdate.calls.length).toBe(2);
          expect(Person.beforeUpdate.calls.length).toBe(1);
          const current = await person.$relatedQuery('movies').orderBy('name');
          expect(current.map((movie) => movie.name)).toEqual([
            'Hungergames',
            'Silver Linings Playbook',
          ]);
          expect((await person.$query()).name).toBe('Jennifer');
        });

        it('should be able to cancel the query with a value', () => {
          Movie.beforeUpdate = createHookSpy(({ cancelQuery }) => {
            cancelQuery(['lol']);
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then((result) => {
              expect(result).toEqual(['lol']);
              expect(queries.length).toBe(0);
            });
        });

        it('`asFindQuery` should find the rows of a canceled query instead of the cancel value', async () => {
          let found = null;

          Movie.beforeUpdate = createHookSpy(async ({ asFindQuery, cancelQuery }) => {
            cancelQuery(['lol']);
            found = await asFindQuery().select('name').where('name', 'like', '%gam%');
          });

          const result = await Movie.query().update({ name: 'Updated' });

          expect(result).toEqual(['lol']);
          expect(found.map((movie) => movie.name)).toEqual(['Hungergames']);
        });
      });

      describe('$query', () => {
        it('should have access to `items` and `inputItems`', () => {
          return Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .then((movie) => {
              Movie.beforeUpdate = createHookSpy(({ items, inputItems }) => {
                expect(items.length).toBe(1);
                expect(inputItems.length).toBe(1);

                expect(items).toContainSubset([
                  {
                    name: 'Silver Linings Playbook',
                  },
                ]);

                expect(inputItems).toContainSubset([
                  {
                    name: 'Updated',
                  },
                ]);
              });

              return movie.$query().patch({ name: 'Updated' });
            })
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              expect(Movie.beforeUpdate.calls.length).toBe(1);
            });
        });

        it('should be able to fetch the rows about to be updated`', () => {
          return Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .then((movie) => {
              queries = [];

              Movie.beforeUpdate = createHookSpy(({ asFindQuery }, call) => {
                return asFindQuery()
                  .select('name')
                  .forUpdate()
                  .then((moviesToBeUpdated) => {
                    expect(moviesToBeUpdated).toHaveLength(1);
                    // Note: moviesToBeUpdated must be an array even though $query()
                    // would normally produce a single item.
                    expect(moviesToBeUpdated).toContainSubset([
                      {
                        name: 'Silver Linings Playbook',
                      },
                    ]);
                    call.queryWasAwaited = true;
                  });
              });

              return movie.$query().patch({ name: 'Updated' });
            })
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              expect(Movie.beforeUpdate.calls.length).toBe(1);
              expect(Movie.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
              expect(queries.length).toBe(2);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.beforeUpdate = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'Updated',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies').update({ name: 'Updated' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(2);
                expect(Movie.beforeUpdate.calls.length).toBe(1);
              });
          });

          it.skipIf(session.isMsSql())(
            'should be able to fetch the rows about to be updated`',
            () => {
              // knex puts the lock of `forUpdate()` after the join on SQL Server,
              // instead of after the table.
              return Person.query()
                .findOne({ name: 'Jennifer' })
                .then((person) => {
                  queries = [];

                  Movie.beforeUpdate = createHookSpy(({ asFindQuery }, call) => {
                    return asFindQuery()
                      .select('name')
                      .forUpdate()
                      .then((moviesToBeUpdated) => {
                        expect(moviesToBeUpdated.length).toBe(2);

                        expect(moviesToBeUpdated).toContainSubset([
                          {
                            name: 'Silver Linings Playbook',
                          },
                          {
                            name: 'Hungergames',
                          },
                        ]);

                        call.queryWasAwaited = true;
                      });
                  });

                  return person.$relatedQuery('movies').patch({ name: 'Updated' });
                })
                .then((numUpdated) => {
                  expect(numUpdated).toBe(2);
                  expect(Movie.beforeUpdate.calls.length).toBe(1);
                  expect(Movie.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
                  expect(queries.length).toBe(2);
                });
            },
          );
        });

        describe('has many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.beforeUpdate = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      species: 'Frog',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets').patch({ species: 'Frog' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(2);
                expect(Pet.beforeUpdate.calls.length).toBe(1);
              });
          });

          it('should be able to fetch the rows about to be updated`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                queries = [];

                Pet.beforeUpdate = createHookSpy(({ asFindQuery }, call) => {
                  return asFindQuery()
                    .select('name')
                    .forUpdate()
                    .then((petsToBeUpdated) => {
                      expect(petsToBeUpdated.length).toBe(2);

                      expect(petsToBeUpdated).toContainSubset([
                        {
                          name: 'Doggo',
                        },
                        {
                          name: 'Cato',
                        },
                      ]);

                      call.queryWasAwaited = true;
                    });
                });

                return person.$relatedQuery('pets').patch({ name: 'Updated' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(2);
                expect(Pet.beforeUpdate.calls.length).toBe(1);
                expect(Pet.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
                expect(queries.length).toBe(2);
              });
          });

          it('should be able to fetch the rows about to be updated when relating', async () => {
            Pet.beforeUpdate = createHookSpy(async ({ asFindQuery }, call) => {
              const petsToBeRelated = await asFindQuery().select('name').forUpdate();

              expect(petsToBeRelated).toHaveLength(2);
              expect(petsToBeRelated).toContainSubset([
                {
                  name: 'Hamsto',
                },
                {
                  name: 'Croco',
                },
              ]);

              call.queryWasAwaited = true;
            });

            const jennifer = await Person.query().findOne({ name: 'Jennifer' });
            const hamsto = await Pet.query().insert({ name: 'Hamsto', species: 'Hamster' });
            const croco = await Pet.query().insert({ name: 'Croco', species: 'Crocodile' });
            queries = [];

            await jennifer.$relatedQuery('pets').relate([hamsto.id, croco.id]);
            expect(Pet.beforeUpdate.calls.length).toBe(1);
            expect(Pet.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
            expect(queries.length).toBe(2);
          });

          it('should be able to fetch the rows about to be updated when unrelating', async () => {
            Pet.beforeUpdate = createHookSpy(async ({ asFindQuery }, call) => {
              const petsToBeUnrelated = await asFindQuery().select('name').forUpdate();

              expect(petsToBeUnrelated).toHaveLength(2);
              expect(petsToBeUnrelated).toContainSubset([
                {
                  name: 'Doggo',
                },
                {
                  name: 'Cato',
                },
              ]);

              call.queryWasAwaited = true;
            });

            const jennifer = await Person.query().findOne({ name: 'Jennifer' });
            queries = [];

            await jennifer.$relatedQuery('pets').unrelate();
            expect(Pet.beforeUpdate.calls.length).toBe(1);
            expect(Pet.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
            expect(queries.length).toBe(2);
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation`, `items` and `inputItems', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.beforeUpdate = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'New Owner',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner').patch({ name: 'New Owner' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(1);
                expect(Person.beforeUpdate.calls.length).toBe(1);
              });
          });

          it('should be able to fetch the rows about to be updated`', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                queries = [];

                Person.beforeUpdate = createHookSpy(({ asFindQuery }, call) => {
                  return asFindQuery()
                    .select('name')
                    .forUpdate()
                    .then((peopleToBeUpdated) => {
                      expect(peopleToBeUpdated.length).toBe(1);

                      expect(peopleToBeUpdated).toContainSubset([
                        {
                          name: 'Jennifer',
                        },
                      ]);

                      call.queryWasAwaited = true;
                    });
                });

                return pet.$relatedQuery('owner').patch({ name: 'Updated' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(1);
                expect(Person.beforeUpdate.calls.length).toBe(1);
                expect(Person.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
                expect(queries.length).toBe(2);
              });
          });
        });
      });
    });

    describe('afterUpdate', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
                {
                  name: 'A Star is Born',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called after normal queries', () => {
          Movie.afterUpdate = createHookSpy();

          return Movie.query()
            .update({ name: 'Updated' })
            .then((numUpdated) => {
              expect(numUpdated).toBe(3);
              expect(Movie.afterUpdate.calls.length).toBe(1);
            });
        });

        it('should be able to change the result', () => {
          Movie.afterUpdate = createHookSpy(({ result }) => {
            return {
              numUpdated: result,
            };
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then((result) => {
              expect(result).toEqual({ numUpdated: 3 });
            });
        });

        it('can be async', () => {
          Movie.afterUpdate = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then((numUpdated) => {
              expect(numUpdated).toBe(3);
              expect(Movie.afterUpdate.calls.length).toBe(1);
              expect(Movie.afterUpdate.calls[0].itWorked).toBe(true);
            });
        });

        it('should have access to `context`', () => {
          Movie.afterUpdate = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .context({ a: 1 })
            .then(() => {
              expect(Movie.afterUpdate.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.afterUpdate = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then(() => {
              expect(Movie.afterUpdate.calls.length).toBe(1);
            });
        });

        it('should have access to `inputItems`', () => {
          Movie.afterUpdate = createHookSpy(({ inputItems }) => {
            expect(inputItems.length).toBe(1);
            expect(inputItems[0] instanceof Movie).toBe(true);
            expect(inputItems).toContainSubset([
              {
                name: 'Updated',
              },
            ]);
          });

          return Movie.query()
            .update({ name: 'Updated' })
            .then(() => {
              expect(Movie.afterUpdate.calls.length).toBe(1);
            });
        });
      });

      describe('$query', () => {
        it('should have access to `items` and `inputItems`', () => {
          return Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .then((movie) => {
              Movie.afterUpdate = createHookSpy(({ items, inputItems }) => {
                expect(items.length).toBe(1);
                expect(inputItems.length).toBe(1);

                // The hook runs last, after the instance has been updated:
                expect(items).toEqual([movie]);
                expect(items).toContainSubset([
                  {
                    name: 'Updated',
                  },
                ]);

                expect(inputItems).toContainSubset([
                  {
                    name: 'Updated',
                  },
                ]);
              });

              return movie.$query().patch({ name: 'Updated' });
            })
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              expect(Movie.afterUpdate.calls.length).toBe(1);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.afterUpdate = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'Updated',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies').update({ name: 'Updated' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(2);
                expect(Movie.afterUpdate.calls.length).toBe(1);
              });
          });

          it('`asFindQuery` should return the updated rows with findById', async () => {
            const person = await Person.query().findOne({ name: 'Jennifer' });
            const movie = await person.$relatedQuery('movies').findOne({ name: 'Hungergames' });
            let found = null;

            Movie.afterUpdate = createHookSpy(async ({ asFindQuery }) => {
              found = await asFindQuery().select('movies.name');
            });

            await person.$relatedQuery('movies').findById(movie.id).patch({ name: 'Updated' });

            expect(Movie.afterUpdate.calls.length).toBe(1);
            expect(found).toContainSubset([{ name: 'Updated' }]);
            expect(found.length).toBe(1);
          });

          it('`asFindQuery` should return the updated rows with upsertGraph', async () => {
            const person = await Person.query()
              .findOne({ name: 'Jennifer' })
              .withGraphFetched('movies');
            const movie = person.movies.find((it) => it.name === 'Hungergames');
            let found = null;

            Movie.afterUpdate = createHookSpy(async ({ asFindQuery }) => {
              found = await asFindQuery().select('movies.name');
            });

            await Person.query().upsertGraph({
              id: person.id,
              movies: person.movies.map((it) =>
                it.id === movie.id ? { id: it.id, name: 'Updated' } : { id: it.id },
              ),
            });

            expect(Movie.afterUpdate.calls.length).toBe(1);
            expect(found).toContainSubset([{ name: 'Updated' }]);
            expect(found.length).toBe(1);
          });
        });

        describe('has many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.afterUpdate = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      species: 'Frog',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets').patch({ species: 'Frog' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(2);
                expect(Pet.afterUpdate.calls.length).toBe(1);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation`, `items` and `inputItems', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.afterUpdate = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'New Owner',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner').patch({ name: 'New Owner' });
              })
              .then((numUpdated) => {
                expect(numUpdated).toBe(1);
                expect(Person.afterUpdate.calls.length).toBe(1);
              });
          });
        });
      });
    });

    describe('beforeDelete', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
                {
                  name: 'A Star is Born',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called before normal queries', () => {
          Movie.beforeDelete = createHookSpy();

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              expect(Movie.beforeDelete.calls.length).toBe(1);
            });
        });

        it('can be async', () => {
          Movie.beforeDelete = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              expect(Movie.beforeDelete.calls.length).toBe(1);
              expect(Movie.beforeDelete.calls[0].itWorked).toBe(true);
            });
        });

        it('should have access to `context`', () => {
          Movie.beforeDelete = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .context({ a: 1 })
            .then(() => {
              expect(Movie.beforeDelete.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.beforeDelete = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .then(() => {
              expect(Movie.beforeDelete.calls.length).toBe(1);
            });
        });

        it('should be able to fetch the rows about to be deleted', () => {
          Movie.beforeDelete = createHookSpy(({ asFindQuery }, call) => {
            return asFindQuery()
              .select('name')
              .forUpdate()
              .then((moviesToBeDeleted) => {
                expect(moviesToBeDeleted).toHaveLength(1);
                expect(moviesToBeDeleted).toContainSubset([
                  {
                    name: 'A Star is Born',
                  },
                ]);
                call.queryWasAwaited = true;
              });
          });

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .then(() => {
              expect(Movie.beforeDelete.calls.length).toBe(1);
              expect(Movie.beforeDelete.calls[0].queryWasAwaited).toBe(true);
              expect(queries.length).toBe(2);
            });
        });

        it('should be able to cancel the query', () => {
          Movie.beforeDelete = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .then((numDeleted) => {
              expect(numDeleted).toBe(0);
              expect(queries.length).toBe(0);
            });
        });

        it('should be able to cancel the query with a value', () => {
          Movie.beforeDelete = createHookSpy(({ cancelQuery }) => {
            cancelQuery(['lol']);
          });

          return Movie.query()
            .delete()
            .where('name', 'A Star is Born')
            .then((result) => {
              expect(result).toEqual(['lol']);
              expect(queries.length).toBe(0);
            });
        });

        it('should be able to fetch the rows about to be deleted`', async () => {
          queries = [];

          Movie.beforeDelete = createHookSpy(async ({ asFindQuery, cancelQuery }) => {
            const numUpdated = await asFindQuery().patch({ name: 'deleted' });
            cancelQuery(numUpdated);
          });

          const numPatched = await Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .delete();

          expect(numPatched).toBe(1);
          expect(queries.length).toBe(1);
          expect(queries[0].bindings).toEqual(['deleted', 'Silver Linings Playbook']);

          if (session.isMySql()) {
            expect(queries[0].sql).toBe('update `movies` set `name` = ? where `name` = ?');
          } else if (session.isPostgres()) {
            expect(queries[0].sql).toBe('update "movies" set "name" = ? where "name" = ?');
          }
        });
      });

      describe('$query', () => {
        it('should have access to `items`', () => {
          return Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .then((movie) => {
              Movie.beforeDelete = createHookSpy(({ items, inputItems }) => {
                expect(items.length).toBe(1);

                expect(items).toContainSubset([
                  {
                    name: 'Silver Linings Playbook',
                  },
                ]);
              });

              return movie.$query().delete();
            })
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              expect(Movie.beforeDelete.calls.length).toBe(1);
            });
        });

        it('should be able to fetch the rows about to be deleted`', () => {
          return Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .then((movie) => {
              queries = [];

              Movie.beforeDelete = createHookSpy(({ asFindQuery }, call) => {
                return asFindQuery()
                  .select('name')
                  .forUpdate()
                  .then((moviesToBeDeleted) => {
                    expect(moviesToBeDeleted).toHaveLength(1);
                    // Note: moviesToBeDeleted must be an array even though $query()
                    // would normally produce a single item.
                    expect(moviesToBeDeleted).toContainSubset([
                      {
                        name: 'Silver Linings Playbook',
                      },
                    ]);
                    call.queryWasAwaited = true;
                  });
              });

              return movie.$query().delete();
            })
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              expect(Movie.beforeDelete.calls.length).toBe(1);
              expect(Movie.beforeDelete.calls[0].queryWasAwaited).toBe(true);
              expect(queries.length).toBe(2);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.beforeDelete = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(2);
                expect(Movie.beforeDelete.calls.length).toBe(1);
              });
          });

          it.skipIf(session.isMsSql())(
            'should be able to fetch the rows about to be deleted`',
            () => {
              // knex puts the lock of `forUpdate()` after the join on SQL Server,
              // instead of after the table.
              return Person.query()
                .findOne({ name: 'Jennifer' })
                .then((person) => {
                  queries = [];

                  Movie.beforeDelete = createHookSpy(({ asFindQuery }, call) => {
                    return asFindQuery()
                      .select('name')
                      .forUpdate()
                      .then((moviesToBeDeleted) => {
                        expect(moviesToBeDeleted.length).toBe(2);

                        expect(moviesToBeDeleted).toContainSubset([
                          {
                            name: 'Silver Linings Playbook',
                          },
                          {
                            name: 'Hungergames',
                          },
                        ]);

                        call.queryWasAwaited = true;
                      });
                  });

                  return person.$relatedQuery('movies').delete();
                })
                .then((numDeleted) => {
                  expect(numDeleted).toBe(2);
                  expect(Movie.beforeDelete.calls.length).toBe(1);
                  expect(Movie.beforeDelete.calls[0].queryWasAwaited).toBe(true);
                  expect(queries.length).toBe(2);
                });
            },
          );
        });

        describe('has many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.beforeDelete = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(2);
                expect(Pet.beforeDelete.calls.length).toBe(1);
              });
          });

          it('should be able to fetch the rows about to be deleted`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                queries = [];

                Pet.beforeDelete = createHookSpy(({ asFindQuery }, call) => {
                  return asFindQuery()
                    .select('name')
                    .forUpdate()
                    .then((moviesToBeDeleted) => {
                      expect(moviesToBeDeleted.length).toBe(2);

                      expect(moviesToBeDeleted).toContainSubset([
                        {
                          name: 'Doggo',
                        },
                        {
                          name: 'Cato',
                        },
                      ]);

                      call.queryWasAwaited = true;
                    });
                });

                return person.$relatedQuery('pets').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(2);
                expect(Pet.beforeDelete.calls.length).toBe(1);
                expect(Pet.beforeDelete.calls[0].queryWasAwaited).toBe(true);
                expect(queries.length).toBe(2);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation` and `items`', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.beforeDelete = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(1);
                expect(Person.beforeDelete.calls.length).toBe(1);
              });
          });

          it('should be able to fetch the rows about to be deleted`', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                queries = [];

                Person.beforeDelete = createHookSpy(({ asFindQuery }, call) => {
                  return asFindQuery()
                    .select('name')
                    .forUpdate()
                    .then((peopleToBeDeleted) => {
                      expect(peopleToBeDeleted.length).toBe(1);

                      expect(peopleToBeDeleted).toContainSubset([
                        {
                          name: 'Jennifer',
                        },
                      ]);

                      call.queryWasAwaited = true;
                    });
                });

                return pet.$relatedQuery('owner').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(1);
                expect(Person.beforeDelete.calls.length).toBe(1);
                expect(Person.beforeDelete.calls[0].queryWasAwaited).toBe(true);
                expect(queries.length).toBe(2);
              });
          });
        });
      });
    });

    describe('afterDelete', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
                {
                  name: 'A Star is Born',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called after normal queries', () => {
          Movie.afterDelete = createHookSpy();

          return Movie.query()
            .delete()
            .then((numDeleted) => {
              expect(numDeleted).toBe(3);
              expect(Movie.afterDelete.calls.length).toBe(1);
            });
        });

        it('should be able to change the result', () => {
          Movie.afterDelete = createHookSpy(({ result }) => {
            return {
              numDeleted: result,
            };
          });

          return Movie.query()
            .delete()
            .where('name', 'Hungergames')
            .then((result) => {
              expect(result).toEqual({ numDeleted: 1 });
            });
        });

        it('can be async', () => {
          Movie.afterDelete = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query()
            .delete()
            .where('name', 'Hungergames')
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              expect(Movie.afterDelete.calls.length).toBe(1);
              expect(Movie.afterDelete.calls[0].itWorked).toBe(true);
            });
        });

        it('should have access to `context`', () => {
          Movie.afterDelete = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .delete()
            .where('name', 'Hungergames')
            .context({ a: 1 })
            .then(() => {
              expect(Movie.afterDelete.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.afterDelete = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query()
            .delete()
            .where('name', 'Hungergames')
            .then(() => {
              expect(Movie.afterDelete.calls.length).toBe(1);
            });
        });
      });

      describe('$query', () => {
        it('should have access to `items`', () => {
          return Movie.query()
            .findOne({ name: 'Silver Linings Playbook' })
            .then((movie) => {
              Movie.afterDelete = createHookSpy(({ items }) => {
                expect(items.length).toBe(1);

                expect(items).toContainSubset([
                  {
                    name: 'Silver Linings Playbook',
                  },
                ]);
              });

              return movie.$query().delete();
            })
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              expect(Movie.afterDelete.calls.length).toBe(1);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.afterDelete = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(2);
                expect(Movie.afterDelete.calls.length).toBe(1);
              });
          });

          it('`asFindQuery` should only match the deleted rows', async () => {
            const person = await Person.query().findOne({ name: 'Jennifer' });
            let found = null;

            Movie.afterDelete = createHookSpy(async ({ asFindQuery }) => {
              found = await asFindQuery().select('movies.name');
            });

            const numDeleted = await person
              .$relatedQuery('movies')
              .where('movies.name', 'Hungergames')
              .delete();

            expect(numDeleted).toBe(1);
            expect(Movie.afterDelete.calls.length).toBe(1);
            // The deleted row is gone. The remaining related row must not match.
            expect(found).toEqual([]);
          });
        });

        describe('has many', () => {
          it('should have access to `relation` and `items`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.afterDelete = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(2);
                expect(Pet.afterDelete.calls.length).toBe(1);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation` and `items`', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.afterDelete = createHookSpy(({ items, relation }) => {
                  expect(items.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner').delete();
              })
              .then((numDeleted) => {
                expect(numDeleted).toBe(1);
                expect(Person.afterDelete.calls.length).toBe(1);
              });
          });
        });
      });
    });

    describe('beforeInsert', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
                {
                  name: 'A Star is Born',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called before normal queries', () => {
          Movie.beforeInsert = createHookSpy();

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then((movie) => {
              expect(movie.id).toBeTypeOf('number');
              expect(Movie.beforeInsert.calls.length).toBe(1);
            });
        });

        it('can be async', () => {
          Movie.beforeInsert = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then((movie) => {
              expect(movie.id).toBeTypeOf('number');
              expect(Movie.beforeInsert.calls.length).toBe(1);
              expect(Movie.beforeInsert.calls[0].itWorked).toBe(true);
            });
        });

        it('should have access to `context`', () => {
          Movie.beforeInsert = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .context({ a: 1 })
            .then(() => {
              expect(Movie.beforeInsert.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.beforeInsert = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then(() => {
              expect(Movie.beforeInsert.calls.length).toBe(1);
            });
        });

        it('should have access to `inputItems`', async () => {
          Movie.beforeInsert = createHookSpy(({ inputItems }) => {
            expect(inputItems.length).toBe(1);
            expect(inputItems[0] instanceof Movie).toBe(true);
            expect(inputItems).toContainSubset([
              {
                name: 'Inserted',
              },
            ]);
          });

          await Movie.query().insert({ name: 'Inserted' });
          await Movie.query().insertAndFetch({ name: 'Inserted' });
          expect(Movie.beforeInsert.calls.length).toBe(2);
        });

        it('should be able to cancel the query', () => {
          Movie.beforeInsert = createHookSpy(({ cancelQuery }) => {
            cancelQuery();
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then((result) => {
              expect(result.name).toBe('Inserted');
              expect(result.id).toBeUndefined();
              expect(queries.length).toBe(0);
            });
        });

        it('should be able to cancel the query with a value', () => {
          Movie.beforeInsert = createHookSpy(({ cancelQuery }) => {
            cancelQuery([{ lol: true }]);
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then((result) => {
              expect(result.lol).toBe(true);
              expect(queries.length).toBe(0);
            });
        });
      });

      describe('$query', () => {
        it('should have access to `items` and `inputItems`', () => {
          const movie = Movie.fromJson({ name: 'Inserted' });

          Movie.beforeInsert = createHookSpy(({ items, inputItems }) => {
            expect(items.length).toBe(1);
            expect(inputItems.length).toBe(1);

            expect(items).toContainSubset([
              {
                name: 'Inserted',
              },
            ]);

            expect(inputItems).toContainSubset([
              {
                name: 'Inserted',
              },
            ]);
          });

          return movie
            .$query()
            .insert()
            .then((result) => {
              expect(result.id).toBeTypeOf('number');
              expect(Movie.beforeInsert.calls.length).toBe(1);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.beforeInsert = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'Inserted',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies').insert({ name: 'Inserted' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeTypeOf('number');
                expect(Movie.beforeInsert.calls.length).toBe(1);
              });
          });

          it('should be able to cancel the query', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                queries = [];

                Movie.beforeInsert = createHookSpy(({ cancelQuery }) => {
                  cancelQuery();
                });

                return person.$relatedQuery('movies').insert({ name: 'Inserted' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeUndefined();
                expect(Movie.beforeInsert.calls.length).toBe(1);
                expect(queries.length).toBe(0);
              });
          });
        });

        describe('has many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.beforeInsert = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      species: 'Frog',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets').insert({ species: 'Frog' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeTypeOf('number');
                expect(inserted.species).toBe('Frog');
                expect(Pet.beforeInsert.calls.length).toBe(1);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation`, `items` and `inputItems', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Pet.beforeUpdate = createHookSpy(async ({ asFindQuery }, call) => {
                  const pets = await asFindQuery().select('name');

                  expect(pets).toHaveLength(1);
                  expect(pets[0].name).toBe('Doggo');

                  call.queryWasAwaited = true;
                });

                Person.beforeInsert = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'New Owner',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner').insert({ name: 'New Owner' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeTypeOf('number');
                expect(inserted.name).toBe('New Owner');
                expect(Person.beforeInsert.calls.length).toBe(1);
                expect(Pet.beforeUpdate.calls.length).toBe(1);
                expect(Pet.beforeUpdate.calls[0].queryWasAwaited).toBe(true);
              });
          });

          it('should be able to cancel the query', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                queries = [];

                Person.beforeInsert = createHookSpy(({ cancelQuery }) => {
                  cancelQuery();
                });

                return pet.$relatedQuery('owner').insert({ name: 'New Owner' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeUndefined();
                expect(inserted.name).toBe('New Owner');
                expect(Person.beforeInsert.calls.length).toBe(1);
                expect(queries.length).toBe(0);
              });
          });
        });
      });
    });

    describe('afterInsert', () => {
      beforeEach(() => {
        return Person.query().insertGraph(
          [
            {
              name: 'Jennifer',

              pets: [
                {
                  name: 'Doggo',
                  species: 'dog',
                },
                {
                  name: 'Cato',
                  species: 'cat',
                },
              ],

              movies: [
                {
                  '#id': 'silver',
                  name: 'Silver Linings Playbook',
                },
                {
                  name: 'Hungergames',
                },
              ],
            },
            {
              name: 'Brad',

              pets: [
                {
                  name: 'Jamie',
                  species: 'Lion',
                },
                {
                  name: 'Rob',
                  species: 'Deer',
                },
              ],

              movies: [
                {
                  '#ref': 'silver',
                },
                {
                  name: 'A Star is Born',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      beforeEach(() => {
        queries = [];
      });

      describe('query', () => {
        it('should be called after normal queries', () => {
          Movie.afterInsert = createHookSpy();

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then((movie) => {
              expect(movie.id).toBeTypeOf('number');
              expect(Movie.afterInsert.calls.length).toBe(1);
            });
        });

        it('should be able to change the result', () => {
          Movie.afterInsert = createHookSpy(({ result }) => {
            return {
              someId: result.id,
              someName: result.name,
            };
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then((result) => {
              expect(result.someId).toBeTypeOf('number');
              expect(result.someName).toBe('Inserted');
            });
        });

        it('can be async', () => {
          Movie.afterInsert = createHookSpy((_, call) => {
            return delay(50).then(() => {
              call.itWorked = true;
            });
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then(() => {
              expect(Movie.afterInsert.calls.length).toBe(1);
              expect(Movie.afterInsert.calls[0].itWorked).toBe(true);
            });
        });

        it('should have access to `context`', () => {
          Movie.afterInsert = createHookSpy(({ context }) => {
            expect(context).toEqual({ a: 1 });
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .context({ a: 1 })
            .then(() => {
              expect(Movie.afterInsert.calls.length).toBe(1);
            });
        });

        it('should have access to `transaction`', () => {
          Movie.afterInsert = createHookSpy(({ transaction }) => {
            expect(transaction).toBe(Movie.knex());
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then(() => {
              expect(Movie.afterInsert.calls.length).toBe(1);
            });
        });

        it('should have access to `inputItems`', () => {
          Movie.afterInsert = createHookSpy(({ inputItems }) => {
            expect(inputItems.length).toBe(1);
            expect(inputItems[0] instanceof Movie).toBe(true);
            expect(inputItems).toContainSubset([
              {
                name: 'Inserted',
              },
            ]);
          });

          return Movie.query()
            .insert({ name: 'Inserted' })
            .then(() => {
              expect(Movie.afterInsert.calls.length).toBe(1);
            });
        });
      });

      describe('$query', () => {
        it('should have access to `items` and `inputItems`', () => {
          const movie = Movie.fromJson({ name: 'Inserted' });

          Movie.afterInsert = createHookSpy(({ items, inputItems }) => {
            expect(items.length).toBe(1);
            expect(inputItems.length).toBe(1);

            expect(items).toContainSubset([
              {
                name: 'Inserted',
              },
            ]);

            expect(inputItems).toContainSubset([
              {
                name: 'Inserted',
              },
            ]);
          });

          return movie
            .$query()
            .insert()
            .then((movie) => {
              expect(movie.id).toBeTypeOf('number');
              expect(Movie.afterInsert.calls.length).toBe(1);
            });
        });
      });

      describe('$relatedQuery', () => {
        describe('many to many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Movie.afterInsert = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'Inserted',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('movies'));
                });

                return person.$relatedQuery('movies').insert({ name: 'Inserted' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeTypeOf('number');
                expect(Movie.afterInsert.calls.length).toBe(1);
              });
          });
        });

        describe('has many', () => {
          it('should have access to `relation`, `items` and `inputItems`', () => {
            return Person.query()
              .findOne({ name: 'Jennifer' })
              .then((person) => {
                Pet.afterInsert = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Jennifer',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'Lol',
                      species: 'Frog',
                    },
                  ]);

                  expect(relation).toBe(Person.getRelation('pets'));
                });

                return person.$relatedQuery('pets').insert({ name: 'Lol', species: 'Frog' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeTypeOf('number');
                expect(Pet.afterInsert.calls.length).toBe(1);
              });
          });
        });

        describe('belongs to one', () => {
          it('should have access to `relation`, `items` and `inputItems', () => {
            return Pet.query()
              .findOne({ name: 'Doggo' })
              .then((pet) => {
                Person.afterInsert = createHookSpy(({ items, inputItems, relation }) => {
                  expect(items.length).toBe(1);
                  expect(inputItems.length).toBe(1);

                  expect(items).toContainSubset([
                    {
                      name: 'Doggo',
                    },
                  ]);

                  expect(inputItems).toContainSubset([
                    {
                      name: 'New Owner',
                    },
                  ]);

                  expect(relation).toBe(Pet.getRelation('owner'));
                });

                return pet.$relatedQuery('owner').insert({ name: 'New Owner' });
              })
              .then((inserted) => {
                expect(inserted.id).toBeTypeOf('number');
                expect(Person.afterInsert.calls.length).toBe(1);
              });
          });
        });
      });
    });

    describe('result', () => {
      let jennifer;
      let brad;
      let calls;

      beforeEach(async () => {
        [jennifer, brad] = await Person.query().insertGraph([
          {
            name: 'Jennifer',
            pets: [
              { name: 'Doggo', species: 'dog' },
              { name: 'Cato', species: 'cat' },
            ],
            movies: [{ name: 'Silver Linings Playbook' }],
          },
          { name: 'Brad' },
        ]);

        calls = [];

        // Log the calls to the after hooks with their results, in call order.
        for (const modelClass of [Person, Pet, Movie]) {
          for (const name of ['afterFind', 'afterInsert', 'afterUpdate', 'afterDelete']) {
            modelClass[name] = createHookSpy(({ result }) => {
              calls.push({ hook: `${modelClass.tableName}.${name}`, result });
            });
          }
        }
      });

      it('should be the model with `first()`', async () => {
        const person = await Person.query().orderBy('name', 'desc').first();

        expect(person.name).toBe('Jennifer');
        expect(calls).toEqual([{ hook: 'people.afterFind', result: person }]);
      });

      it('should be the model with `findById()`', async () => {
        const person = await Person.query().findById(jennifer.id);

        expect(person.name).toBe('Jennifer');
        expect(calls).toEqual([{ hook: 'people.afterFind', result: person }]);
      });

      it('should be undefined with `findById()` if nothing is found', async () => {
        const person = await Person.query().findById(jennifer.id + brad.id);

        expect(person).toBeUndefined();
        expect(calls).toEqual([{ hook: 'people.afterFind', result: undefined }]);
      });

      it('should be the models with `page()`', async () => {
        const page = await Person.query().orderBy('name', 'desc').page(0, 1);

        expect(page.total).toBe(2);
        expect(page.results.map((person) => person.name)).toEqual(['Jennifer']);
        expect(calls).toEqual([{ hook: 'people.afterFind', result: page.results }]);
      });

      it('should be used as the input of `page()`', async () => {
        Person.afterFind = ({ result }) => result.map((person) => person.name);

        const page = await Person.query().orderBy('name', 'desc').page(0, 1);
        expect(page).toEqual({ results: ['Jennifer'], total: 2 });
      });

      it('should be returned before `runAfter()` callbacks are called', async () => {
        Person.afterFind = ({ result }) => result.name;
        const results = [];

        const name = await Person.query()
          .context({ runAfter: (result) => results.push(result) && result })
          .runAfter((result) => results.push(result) && result.toUpperCase())
          .findById(jennifer.id);

        expect(name).toBe('JENNIFER');
        expect(results).toEqual(['Jennifer', 'Jennifer']);
      });

      it('should be used by `throwIfNotFound()`', async () => {
        Person.afterFind = () => [];

        await expect(Person.query().findById(jennifer.id).throwIfNotFound()).rejects.toThrow(
          Person.NotFoundError,
        );
      });

      it('should be the inserted model with `insert()`', async () => {
        const person = await Person.query().insert({ name: 'Ada' });

        expect(person.id).toBeTypeOf('number');
        expect(calls).toEqual([{ hook: 'people.afterInsert', result: person }]);
      });

      it('should be the inserted models with `insert()` and an array', async () => {
        const people = await Person.query().insert([{ name: 'Ada' }]);

        expect(people).toHaveLength(1);
        expect(calls).toEqual([{ hook: 'people.afterInsert', result: people }]);
      });

      it('should be the fetched model with `insertAndFetch()`, after the fetch', async () => {
        const person = await Person.query().insertAndFetch({ name: 'Ada' });

        expect(person.id).toBeTypeOf('number');
        expect(calls).toEqual([
          { hook: 'people.afterFind', result: [person] },
          { hook: 'people.afterInsert', result: person },
        ]);
      });

      it('should be the number of updated rows with `patch()`', async () => {
        const numUpdated = await Person.query().patch({ name: 'Updated' });

        expect(numUpdated).toBe(2);
        expect(calls).toEqual([{ hook: 'people.afterUpdate', result: 2 }]);
      });

      it('should be the fetched model with `patchAndFetchById()`, after the fetch', async () => {
        const person = await Person.query().patchAndFetchById(jennifer.id, { name: 'Updated' });

        expect(person.name).toBe('Updated');
        expect(calls).toEqual([
          { hook: 'people.afterFind', result: person },
          { hook: 'people.afterUpdate', result: person },
        ]);
      });

      it('should be undefined with `patchAndFetchById()` if nothing is updated', async () => {
        const id = jennifer.id + brad.id;
        const person = await Person.query().patchAndFetchById(id, { name: 'Updated' });

        expect(person).toBeUndefined();
        expect(calls).toEqual([{ hook: 'people.afterUpdate', result: undefined }]);
      });

      it('should be the fetched model with `$query().patchAndFetch()`', async () => {
        const person = await jennifer.$query().patchAndFetch({ name: 'Updated' });

        expect(person.name).toBe('Updated');
        expect(calls).toEqual([
          { hook: 'people.afterFind', result: person },
          { hook: 'people.afterUpdate', result: person },
        ]);
      });

      it('should throw if `afterFind()` returns no model for `patchAndFetchById()`', async () => {
        Person.afterFind = ({ result }) => result.name;

        await expect(
          Person.query().patchAndFetchById(jennifer.id, { name: 'Updated' }),
        ).rejects.toThrow(
          'Unable to merge the result of Person.afterFind() in patchAndFetch(): expected a model.',
        );
      });

      it('should throw if `afterFind()` returns no models for `insertAndFetch()`', async () => {
        Person.afterFind = ({ result }) => result.map((person) => person.name);

        await expect(Person.query().insertAndFetch({ name: 'Ada' })).rejects.toThrow(
          'Unable to merge the result of Person.afterFind() in insertAndFetch(): ' +
            'expected an array of models.',
        );
      });

      it('should be the number of deleted rows with `delete()`', async () => {
        const numDeleted = await Pet.query().delete().where('name', 'Doggo');

        expect(numDeleted).toBe(1);
        expect(calls).toEqual([{ hook: 'pets.afterDelete', result: 1 }]);
      });

      it('should be the related models with `$relatedQuery()`', async () => {
        const pets = await jennifer.$relatedQuery('pets').orderBy('name', 'desc');

        expect(pets.map((pet) => pet.name)).toEqual(['Doggo', 'Cato']);
        expect(calls).toEqual([{ hook: 'pets.afterFind', result: pets }]);
      });

      it('should be the related model with `$relatedQuery()` of a to-one relation', async () => {
        const pet = await Pet.query().findOne({ name: 'Doggo' });
        calls = [];

        const owner = await pet.$relatedQuery('owner');
        expect(owner.name).toBe('Jennifer');
        expect(calls).toEqual([{ hook: 'people.afterFind', result: owner }]);
      });

      it('should be the related models of all owners in `withGraphFetched()`', async () => {
        const people = await Person.query()
          .withGraphFetched('pets')
          .modifyGraph('pets', (builder) => builder.orderBy('name', 'desc').first())
          .orderBy('name', 'desc');

        expect(people.map((person) => person.pets.map((pet) => pet.name))).toEqual([['Doggo'], []]);
        expect(calls).toEqual([
          { hook: 'pets.afterFind', result: [people[0].pets[0]] },
          { hook: 'people.afterFind', result: people },
        ]);
      });

      it('should be the inserted model with `$relatedQuery().insert()`', async () => {
        const pet = await brad.$relatedQuery('pets').insert({ name: 'Rob' });

        expect(calls).toEqual([{ hook: 'pets.afterInsert', result: pet }]);
      });

      it('should be the value of `cancelQuery()` in the shape of the query', async () => {
        Person.beforeFind = ({ cancelQuery }) => cancelQuery();

        expect(await Person.query().first()).toBeUndefined();
        expect(await Person.query().findById(jennifer.id)).toBeUndefined();
        expect(await Person.query()).toEqual([]);
        expect(calls).toEqual([
          { hook: 'people.afterFind', result: undefined },
          { hook: 'people.afterFind', result: undefined },
          { hook: 'people.afterFind', result: [] },
        ]);
      });

      it('should be the value of `resolve()` and `none()` in the shape of the query', async () => {
        const person = Person.fromJson({ id: 1, name: 'Resolved' });

        expect(await Person.query().resolve([person]).first()).toBe(person);
        expect(await Person.query().none()).toEqual([]);
        expect(calls).toEqual([
          { hook: 'people.afterFind', result: person },
          { hook: 'people.afterFind', result: [] },
        ]);
      });

      it('should merge a single row given to `cancelQuery()` into the inserted model', async () => {
        Person.beforeInsert = ({ cancelQuery }) => cancelQuery({ id: 42 });
        queries = [];

        const person = await Person.query().insert({ name: 'Ada' });
        expect(person).toEqual(Person.fromJson({ id: 42, name: 'Ada' }));
        expect(calls).toEqual([{ hook: 'people.afterInsert', result: person }]);
        expect(queries).toHaveLength(0);
      });

      it('should not call the hooks of the root class for the outer `upsertGraph()` query', async () => {
        Person.beforeFind = createHookSpy();

        await Person.query().upsertGraph({ id: brad.id, name: 'Bradley' });

        // The query that fetches the current graph calls the find hooks.
        expect(Person.beforeFind.calls).toHaveLength(1);
        expect(calls).toEqual([
          { hook: 'people.afterFind', result: [expect.objectContaining({ id: brad.id })] },
          { hook: 'people.afterUpdate', result: 1 },
        ]);
      });

      it('should not call the hooks of the root class for the outer `insertGraph()` query', async () => {
        const [person] = await Person.query().insertGraph([
          { name: 'Ada', pets: [{ name: 'Rob' }] },
        ]);

        expect(calls).toEqual([
          { hook: 'people.afterInsert', result: [person] },
          { hook: 'pets.afterInsert', result: person.pets },
        ]);
      });

      it('should not call the find hooks of the root class in `fetchGraph()`', async () => {
        Person.beforeFind = createHookSpy();

        const person = await Person.fetchGraph(jennifer.$clone(), 'pets');

        expect(person.pets).toHaveLength(2);
        expect(Person.beforeFind.calls).toHaveLength(0);
        expect(calls).toEqual([{ hook: 'pets.afterFind', result: person.pets }]);
      });

      describe('withGraphFetched()', () => {
        it('should assign the related models that `afterFind()` returns', async () => {
          Pet.afterFind = ({ result }) => result.filter((pet) => pet.species === 'dog');
          Movie.afterFind = () => [];

          const people = await Person.query()
            .withGraphFetched('[pets, movies]')
            .orderBy('name', 'desc');

          expect(people.map((person) => person.pets.map((pet) => pet.name))).toEqual([
            ['Doggo'],
            [],
          ]);
          expect(people.map((person) => person.movies)).toEqual([[], []]);
        });

        it('should keep the order of the related models that `afterFind()` returns', async () => {
          Pet.afterFind = ({ result }) => [...result].sort((a, b) => a.name.localeCompare(b.name));

          const person = await Person.query()
            .findById(jennifer.id)
            .withGraphFetched('pets')
            .modifyGraph('pets', (builder) => builder.orderBy('name', 'desc'));

          expect(person.pets.map((pet) => pet.name)).toEqual(['Cato', 'Doggo']);
        });

        it('should assign null to to-one relations if `afterFind()` filters the model', async () => {
          Person.afterFind = () => [];

          const pet = await Pet.query().findOne({ name: 'Doggo' }).withGraphFetched('owner');
          expect(pet.owner).toBeNull();
        });

        it('should throw if `afterFind()` returns other objects than the related models', async () => {
          Pet.afterFind = ({ result }) => result.map((pet) => ({ ...pet }));

          await expect(Person.query().withGraphFetched('pets')).rejects.toThrow(
            'Unable to assign the result to relation "pets" of Person: afterFind() and ' +
              'runAfter() can only return the related models that the query found, filtered ' +
              'or reordered.',
          );
        });

        it('should assign what `runAfter()` returns', async () => {
          const person = await Person.query()
            .findById(jennifer.id)
            .withGraphFetched('pets')
            .modifyGraph('pets', (builder) =>
              builder.runAfter((pets) => pets.filter((pet) => pet.species === 'cat')),
            );

          expect(person.pets.map((pet) => pet.name)).toEqual(['Cato']);
        });

        it('should assign what `runAfter` callbacks of the context return', async () => {
          const runAfter = (result, builder) =>
            builder.modelClass() === Pet ? result.filter((pet) => pet.species === 'dog') : result;

          const person = await Person.query()
            .findById(jennifer.id)
            .withGraphFetched('pets')
            .context({ runAfter });

          expect(person.pets.map((pet) => pet.name)).toEqual(['Doggo']);
        });

        it('should throw if `runAfter()` returns other objects than the related models', async () => {
          await expect(
            Person.query()
              .withGraphFetched('pets')
              .modifyGraph('pets', (builder) => builder.runAfter((pets) => pets.length)),
          ).rejects.toThrow('Unable to assign the result to relation "pets" of Person');
        });

        it('should assign the models of `page()` with `relatedFindQueryMutates`', async () => {
          Person.relatedFindQueryMutates = true;

          const page = await jennifer.$relatedQuery('pets').orderBy('name').page(0, 1);
          expect(page.total).toBe(2);
          expect(jennifer.pets).toEqual(page.results);
          expect(jennifer.pets.map((pet) => pet.name)).toEqual(['Cato']);
        });

        it('should assign what `afterFind()` returns with `relatedFindQueryMutates`', async () => {
          Person.relatedFindQueryMutates = true;
          Pet.afterFind = ({ result }) => result.filter((pet) => pet.species === 'cat');

          const pets = await jennifer.$relatedQuery('pets');
          expect(pets.map((pet) => pet.name)).toEqual(['Cato']);
          expect(jennifer.pets).toEqual(pets);
        });
      });

      describe('withGraphJoined()', () => {
        it('should call `afterFind()` of the joined relations bottom-up', async () => {
          const people = await Person.query()
            .withGraphJoined('[pets.owner, movies]')
            .orderBy('people.name', 'desc');

          const [jennifer, brad] = people;
          const pets = jennifer.pets;
          const owners = pets.map((pet) => pet.owner);

          expect(calls.map(({ hook }) => hook)).toEqual([
            'movies.afterFind',
            'people.afterFind',
            'pets.afterFind',
            'people.afterFind',
          ]);
          expect(calls[0].result).toEqual(jennifer.movies);
          expect(calls[1].result).toEqual(owners);
          expect(calls[2].result).toEqual(pets);
          expect(calls[3].result).toEqual(people);
          expect(brad.pets).toEqual([]);
        });

        it('should pass the relation and the owners', async () => {
          Pet.afterFind = createHookSpy();

          const people = await Person.query().withGraphJoined('pets');
          const { args } = Pet.afterFind.calls[0];

          expect(Pet.afterFind.calls).toHaveLength(1);
          expect(args.relation).toBe(Person.getRelation('pets'));
          expect(args.items).toEqual(people);
          expect(args.inputItems).toEqual([]);
          expect(() => args.asFindQuery()).toThrow(
            'asFindQuery() is not available for relations fetched with withGraphJoined().',
          );
          expect(() => args.cancelQuery()).toThrow(
            'cancelQuery() is not available for relations fetched with withGraphJoined().',
          );
        });

        it('should assign the related models that `afterFind()` returns', async () => {
          Pet.afterFind = ({ result }) => result.filter((pet) => pet.species === 'dog');
          Person.afterFind = ({ relation }) => (relation ? [] : undefined);

          const person = await Person.query().findById(jennifer.id).withGraphJoined('pets.owner');

          expect(person.pets.map((pet) => pet.name)).toEqual(['Doggo']);
          expect(person.pets[0].owner).toBeNull();
        });

        it('should keep the order of the related models that `afterFind()` returns', async () => {
          Pet.afterFind = ({ result }) => [...result].sort((a, b) => a.name.localeCompare(b.name));

          const person = await Person.query()
            .findById(jennifer.id)
            .withGraphJoined('pets')
            .orderBy('pets.name', 'desc');

          expect(person.pets.map((pet) => pet.name)).toEqual(['Cato', 'Doggo']);
        });

        it('should throw if `afterFind()` returns other objects than the related models', async () => {
          Pet.afterFind = ({ result }) => result.map((pet) => ({ ...pet }));

          await expect(Person.query().withGraphJoined('pets')).rejects.toThrow(
            'Unable to assign the result of Pet.afterFind() to the relation "pets" of Person: ' +
              'return the models you got, filtered or reordered.',
          );
        });
      });

      describe('relate() and unrelate()', () => {
        let ActorMovie;
        let Actor;

        beforeEach(() => {
          ActorMovie = class extends Model {
            static get tableName() {
              return 'actorsMovies';
            }
          };

          Actor = class extends Person {
            static get relationMappings() {
              return {
                movies: {
                  relation: Model.ManyToManyRelation,
                  modelClass: Movie,
                  join: {
                    from: 'people.id',
                    through: {
                      modelClass: ActorMovie,
                      from: 'actorsMovies.personId',
                      to: 'actorsMovies.movieId',
                    },
                    to: 'movies.id',
                  },
                },
              };
            }
          };

          ActorMovie.knex(knex);
        });

        // The hooks of the query that relate() or unrelate() runs get the
        // relation and the owners of the relate or unrelate query.
        const spyOn = (modelClass, name) => {
          modelClass[name] = createHookSpy(({ result, relation, items }) => {
            calls.push({ hook: `${modelClass.tableName}.${name}`, result, relation, items });
          });
        };

        it('should pass the relation and the owners to the related `afterUpdate()` of has many', async () => {
          spyOn(Pet, 'afterUpdate');
          const pet = await Pet.query().insert({ name: 'Rob' });
          calls = [];

          expect(await brad.$relatedQuery('pets').relate(pet.id)).toBe(1);
          expect(await brad.$relatedQuery('pets').unrelate()).toBe(1);

          const relation = Person.getRelation('pets');
          expect(calls).toEqual([
            { hook: 'pets.afterUpdate', result: 1, relation, items: [brad] },
            { hook: 'pets.afterUpdate', result: 1, relation, items: [brad] },
          ]);
        });

        it('should pass the relation and the owners to the owner `afterUpdate()` of belongs to one', async () => {
          spyOn(Pet, 'afterUpdate');
          const pet = await Pet.query().insert({ name: 'Rob' });
          calls = [];

          expect(await pet.$relatedQuery('owner').relate(brad.id)).toBe(1);
          expect(await pet.$relatedQuery('owner').unrelate()).toBe(1);

          const relation = Pet.getRelation('owner');
          expect(calls).toEqual([
            { hook: 'pets.afterUpdate', result: 1, relation, items: [pet] },
            { hook: 'pets.afterUpdate', result: 1, relation, items: [pet] },
          ]);
        });

        it('should pass the relation and the owners to the join model hooks of many to many', async () => {
          spyOn(ActorMovie, 'afterInsert');
          spyOn(ActorMovie, 'afterDelete');
          const actor = Actor.fromJson({ id: brad.id, name: 'Brad' });
          const movie = await Movie.query().insert({ name: 'Fight Club' });
          calls = [];

          expect(await actor.$relatedQuery('movies').relate(movie.id)).toBe(1);
          expect(await actor.$relatedQuery('movies').unrelate()).toBe(1);

          const relation = Actor.getRelation('movies');
          expect(calls).toEqual([
            {
              hook: 'actorsMovies.afterInsert',
              result: [expect.objectContaining({ personId: brad.id, movieId: movie.id })],
              relation,
              items: [actor],
            },
            { hook: 'actorsMovies.afterDelete', result: 1, relation, items: [actor] },
          ]);
        });
      });
    });
  });
};

function createHookSpy(hook = () => {}) {
  const spy = (args) => {
    const call = { args };
    spy.calls.push(call);
    return hook(args, call);
  };

  spy.calls = [];
  return spy;
}

function delay(millis) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}
