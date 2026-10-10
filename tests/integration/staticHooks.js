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

          it('should be able to fetch the rows about to be updated`', () => {
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
          });
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
              numUpdated: result[0],
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

          it('should be able to fetch the rows about to be deleted`', () => {
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
          });
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
              numDeleted: result[0],
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
              someId: result[0].id,
              someName: result[0].name,
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
