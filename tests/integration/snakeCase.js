import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Knex from 'knex';
import { Model, ref, snakeCaseMappers, knexSnakeCaseMappers } from 'objection';

export default (session) => {
  describe('snakeCaseMappers', () => {
    class Person extends Model {
      $formatDatabaseJson(json) {
        json = super.$formatDatabaseJson(json);
        delete json.id;
        return json;
      }

      static get tableName() {
        return 'person';
      }

      static get columnNameMappers() {
        return snakeCaseMappers();
      }

      static get jsonAttributes() {
        return ['address'];
      }

      static get relationMappings() {
        return {
          parentPerson: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: {
              from: 'person.parent_id',
              to: 'person.id',
            },
          },

          pets: {
            relation: Model.HasManyRelation,
            modelClass: Animal,
            join: {
              from: 'person.id',
              to: 'animal.owner_id',
            },
          },

          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'person.id',
              through: {
                from: 'person_movie.person_id',
                to: 'person_movie.movie_id',
              },
              to: 'movie.id',
            },
          },
        };
      }
    }

    class Animal extends Model {
      static get tableName() {
        return 'animal';
      }

      static get columnNameMappers() {
        return snakeCaseMappers();
      }
    }

    class Movie extends Model {
      static get tableName() {
        return 'movie';
      }

      static get columnNameMappers() {
        return snakeCaseMappers();
      }
    }

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('person_movie')
        .dropTableIfExists('animal')
        .dropTableIfExists('movie')
        .dropTableIfExists('person')
        .createTable('person', (table) => {
          table.increments('id').primary();
          table.string('first_name');
          table.integer('parent_id');

          if (session.isPostgres()) {
            table.jsonb('person_address');
          }
        })
        .createTable('animal', (table) => {
          table.increments('id').primary();
          table.string('animal_name');
          table.integer('owner_id');
        })
        .createTable('movie', (table) => {
          table.increments('id').primary();
          table.string('movie_name');
        })
        .createTable('person_movie', (table) => {
          table.integer('person_id');
          table.integer('movie_id');
        });
    });

    describe('queries', () => {
      beforeEach(() => {
        function maybeWithAddress(obj, address) {
          if (session.isPostgres()) {
            obj.personAddress = address;
          }

          return obj;
        }

        return Person.query(session.knex).insertGraph({
          firstName: 'Seppo',

          parentPerson: {
            firstName: 'Teppo',

            parentPerson: maybeWithAddress(
              {
                firstName: 'Matti',
              },
              {
                personCity: 'Jalasjärvi',

                cityCoordinates: {
                  latitudeCoordinate: 61,
                  longitudeCoordinate: 23,
                },
              },
            ),
          },

          pets: [
            {
              animalName: 'Hurtta',
            },
            {
              animalName: 'Katti',
            },
          ],

          movies: [
            {
              movieName: 'Salkkarit the movie',
            },
            {
              movieName: 'Salkkarit 2, the low quality continues',
            },
          ],
        });
      });

      afterEach(() => {
        return ['animal', 'person_movie', 'movie', 'person'].reduce((promise, table) => {
          return promise.then(() => session.knex(table).delete());
        }, Promise.resolve());
      });

      it('$relatedQuery', () => {
        return Person.query(session.knex)
          .findOne({ first_name: 'Seppo' })
          .then((model) => {
            return model.$relatedQuery('pets', session.knex).orderBy('animal_name');
          })
          .then((pets) => {
            expect(pets).toContainSubset([
              {
                animalName: 'Hurtta',
              },
              {
                animalName: 'Katti',
              },
            ]);
          });
      });

      it('joinRelated', () => {
        return Person.query(session.knex)
          .joinRelated('parentPerson.parentPerson')
          .select('parentPerson:parentPerson.first_name as nestedRef')
          .then((result) => {
            expect(result).toContainSubset([{ nestedRef: 'Matti' }]);
          });
      });

      if (session.isPostgres()) {
        // TODO: Enable and fix after -> is used as a separator.
        it.skip('update with json references', () => {
          return Person.query(session.knex)
            .where('first_name', 'Matti')
            .patch({
              'person_address:cityCoordinates.latitudeCoordinate': 30,
            })
            .returning('*')
            .then((result) => {
              expect(result).toContainSubset([
                {
                  firstName: 'Matti',
                  parentId: null,
                  personAddress: {
                    personCity: 'Jalasjärvi',
                    cityCoordinates: {
                      latitudeCoordinate: 30,
                      longitudeCoordinate: 23,
                    },
                  },
                },
              ]);
            });
        });

        describe('json field expressions', () => {
          const latitudeRef = 'person_address:cityCoordinates.latitudeCoordinate';

          class PreservingPerson extends Person {
            static get columnNameMappers() {
              return snakeCaseMappers({ preserveJsonKeys: true });
            }
          }

          function fetchMatti() {
            return session.knex('person').where('first_name', 'Matti').first();
          }

          it('patch maps json keys of field expressions by default', async () => {
            await Person.query(session.knex)
              .where('first_name', 'Matti')
              .patch({ 'personAddress:personCity': 'Helsinki' });

            const { person_address } = await fetchMatti();
            expect(person_address.personCity).toBe('Jalasjärvi');
            expect(person_address.person_city).toBe('Helsinki');
          });

          it('patch only maps the column part with `preserveJsonKeys: true`', async () => {
            const numUpdated = await PreservingPerson.query(session.knex)
              .where(ref(latitudeRef), 61)
              .patch({ 'personAddress:cityCoordinates.latitudeCoordinate': 30 });

            expect(numUpdated).toBe(1);
            const { person_address } = await fetchMatti();
            expect(person_address).toEqual({
              personCity: 'Jalasjärvi',
              cityCoordinates: { latitudeCoordinate: 30, longitudeCoordinate: 23 },
            });

            const result = await PreservingPerson.query(session.knex)
              .select('first_name', ref(latitudeRef).castInt().as('latitude'))
              .whereJsonSupersetOf('person_address:cityCoordinates', { latitudeCoordinate: 30 });

            expect(result.map((it) => it.toJSON())).toEqual([{ firstName: 'Matti', latitude: 30 }]);
          });

          it('knexSnakeCaseMappers never maps json keys of field expressions', async () => {
            const knex = Knex({ ...session.knex.client.config, ...knexSnakeCaseMappers() });

            class KnexPerson extends Model {
              static get tableName() {
                return 'person';
              }

              static get jsonAttributes() {
                return ['personAddress'];
              }
            }

            try {
              const numUpdated = await KnexPerson.query(knex)
                .where(ref('personAddress:cityCoordinates.latitudeCoordinate'), 61)
                .patch({ 'personAddress:cityCoordinates.latitudeCoordinate': 30 });

              expect(numUpdated).toBe(1);
              const { person_address } = await fetchMatti();
              expect(person_address.cityCoordinates).toEqual({
                latitudeCoordinate: 30,
                longitudeCoordinate: 23,
              });

              const result = await KnexPerson.query(knex)
                .select(
                  'firstName',
                  ref('personAddress:cityCoordinates.latitudeCoordinate').as('latitudeValue'),
                )
                .whereNotNull('personAddress');

              expect(result.map((it) => it.toJSON())).toEqual([
                { firstName: 'Matti', latitudeValue: 30 },
              ]);
            } finally {
              await knex.destroy();
            }
          });
        });
      }

      ['withGraphFetched', 'withGraphJoined'].forEach((method) => {
        it(`eager (${method})`, () => {
          return Person.query(session.knex)
            .select('person.first_name as rootFirstName')
            .modifyGraph('parentPerson', (qb) => qb.select('first_name as parentFirstName'))
            .modifyGraph('parentPerson.parentPerson', (qb) =>
              qb.select('first_name as grandParentFirstName'),
            )
            [method]('[parentPerson.parentPerson, pets, movies]')
            .orderBy('person.first_name')
            .then((people) => {
              expect(people.length).toBe(3);
              expect(people).toContainSubset([
                {
                  rootFirstName: 'Seppo',

                  parentPerson: {
                    parentFirstName: 'Teppo',

                    parentPerson: {
                      grandParentFirstName: 'Matti',
                    },
                  },

                  pets: [
                    {
                      animalName: 'Hurtta',
                    },
                    {
                      animalName: 'Katti',
                    },
                  ],

                  movies: [
                    {
                      movieName: 'Salkkarit 2, the low quality continues',
                    },
                    {
                      movieName: 'Salkkarit the movie',
                    },
                  ],
                },
                {
                  rootFirstName: 'Teppo',

                  parentPerson: {
                    parentFirstName: 'Matti',
                  },
                },
                {
                  rootFirstName: 'Matti',
                },
              ]);
            });
        });
      });
    });

    afterAll(() => {
      return session.knex.schema
        .dropTableIfExists('person_movie')
        .dropTableIfExists('animal')
        .dropTableIfExists('movie')
        .dropTableIfExists('person');
    });
  });

  describe('snakeCaseMappers uppercase = true', () => {
    class Person extends Model {
      static get tableName() {
        return 'PERSON';
      }

      static get idColumn() {
        return 'ID';
      }

      static get columnNameMappers() {
        return snakeCaseMappers({ upperCase: true });
      }

      static get relationMappings() {
        return {
          parentPerson: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: {
              from: 'PERSON.PARENT_ID',
              to: 'PERSON.ID',
            },
          },

          pets: {
            relation: Model.HasManyRelation,
            modelClass: Animal,
            join: {
              from: 'PERSON.ID',
              to: 'ANIMAL.OWNER_ID',
            },
          },

          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'PERSON.ID',
              through: {
                from: 'PERSON_MOVIE.PERSON_ID',
                to: 'PERSON_MOVIE.MOVIE_ID',
              },
              to: 'MOVIE.ID',
            },
          },
        };
      }
    }

    class Animal extends Model {
      static get tableName() {
        return 'ANIMAL';
      }

      static get idColumn() {
        return 'ID';
      }

      static get columnNameMappers() {
        return snakeCaseMappers({ upperCase: true });
      }
    }

    class Movie extends Model {
      static get tableName() {
        return 'MOVIE';
      }

      static get idColumn() {
        return 'ID';
      }

      static get columnNameMappers() {
        return snakeCaseMappers({ upperCase: true });
      }
    }

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('PERSON_MOVIE')
        .dropTableIfExists('ANIMAL')
        .dropTableIfExists('MOVIE')
        .dropTableIfExists('PERSON')
        .createTable('PERSON', (table) => {
          table.increments('ID').primary();
          table.string('FIRST_NAME');
          table.integer('PARENT_ID');
        })
        .createTable('ANIMAL', (table) => {
          table.increments('ID').primary();
          table.string('ANIMAL_NAME');
          table.integer('OWNER_ID');
        })
        .createTable('MOVIE', (table) => {
          table.increments('ID').primary();
          table.string('MOVIE_NAME');
        })
        .createTable('PERSON_MOVIE', (table) => {
          table.integer('PERSON_ID');
          table.integer('MOVIE_ID');
        });
    });

    describe('queries', () => {
      beforeEach(() => {
        return Person.query(session.knex).insertGraph({
          firstName: 'Seppo',

          parentPerson: {
            firstName: 'Teppo',

            parentPerson: {
              firstName: 'Matti',
            },
          },

          pets: [
            {
              animalName: 'Hurtta',
            },
            {
              animalName: 'Katti',
            },
          ],

          movies: [
            {
              movieName: 'Salkkarit the movie',
            },
            {
              movieName: 'Salkkarit 2, the low quality continues',
            },
          ],
        });
      });

      afterEach(() => {
        return ['ANIMAL', 'PERSON_MOVIE', 'MOVIE', 'PERSON'].reduce((promise, table) => {
          return promise.then(() => session.knex(table).delete());
        }, Promise.resolve());
      });

      it('$relatedQuery', () => {
        return Person.query(session.knex)
          .findOne({ FIRST_NAME: 'Seppo' })
          .then((model) => {
            return model.$relatedQuery('pets', session.knex).orderBy('ANIMAL_NAME');
          })
          .then((pets) => {
            expect(pets).toContainSubset([
              {
                animalName: 'Hurtta',
              },
              {
                animalName: 'Katti',
              },
            ]);
          });
      });

      ['withGraphFetched', 'withGraphJoined'].forEach((method) => {
        it(`eager (${method})`, () => {
          return Person.query(session.knex)
            .select('PERSON.FIRST_NAME as rootFirstName')
            .modifyGraph('parentPerson', (qb) => qb.select('FIRST_NAME as parentFirstName'))
            .modifyGraph('parentPerson.parentPerson', (qb) =>
              qb.select('FIRST_NAME as GRAND_PARENT_FIRST_NAME'),
            )
            [method]('[parentPerson.parentPerson, pets, movies]')
            .orderBy('PERSON.FIRST_NAME')
            .then((people) => {
              expect(people.length).toBe(3);
              expect(people).toContainSubset([
                {
                  rootFirstName: 'Seppo',

                  parentPerson: {
                    parentFirstName: 'Teppo',

                    parentPerson: {
                      grandParentFirstName: 'Matti',
                    },
                  },

                  pets: [
                    {
                      animalName: 'Hurtta',
                    },
                    {
                      animalName: 'Katti',
                    },
                  ],

                  movies: [
                    {
                      movieName: 'Salkkarit 2, the low quality continues',
                    },
                    {
                      movieName: 'Salkkarit the movie',
                    },
                  ],
                },
                {
                  rootFirstName: 'Teppo',

                  parentPerson: {
                    parentFirstName: 'Matti',
                  },
                },
                {
                  rootFirstName: 'Matti',
                },
              ]);
            });
        });
      });
    });

    afterAll(() => {
      return session.knex.schema
        .dropTableIfExists('PERSON_MOVIe')
        .dropTableIfExists('ANIMAL')
        .dropTableIfExists('MOVIE')
        .dropTableIfExists('PERSON');
    });
  });
};
