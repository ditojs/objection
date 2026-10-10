import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe(`upsertGraph with composite key relation doesn't copy foreign keys #1265`, () => {
    let knex = session.knex;
    let Person, Animal;

    beforeAll(() => {
      return knex.schema
        .createTable('Person', (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().notNullable();
          table.integer('projectId').unsigned().notNullable();
          table.string('firstName');
          table.string('lastName');
        })
        .createTable('Animal', (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().notNullable();
          table.integer('projectId').unsigned().notNullable();
          table.string('name');
          table.string('species');
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('Animal').dropTableIfExists('Person');
    });

    beforeEach(() => {
      Animal = class Animal extends Model {
        static get tableName() {
          return 'Animal';
        }

        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Person,
              join: {
                from: ['Animal.userId', 'Animal.projectId'],
                to: ['Person.userId', 'Person.projectId'],
              },
            },
          };
        }
      };

      Animal.knex(knex);
    });

    beforeEach(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'Person';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Animal,
              join: {
                from: ['Person.userId', 'Person.projectId'],
                to: ['Animal.userId', 'Animal.projectId'],
              },
            },
          };
        }
      };

      Person.knex(knex);
    });

    beforeEach(() => Animal.query().delete());
    beforeEach(() => Person.query().delete());

    beforeEach(() => {
      return Person.query().insertGraph({
        firstName: 'Jennifer',
        lastName: 'Lawrence',
        userId: 1,
        projectId: 1,

        pets: [
          {
            name: 'Doggo',
            species: 'dog',
          },
          {
            name: 'Grumpy',
            species: 'cat',
          },
        ],
      });
    });

    it('test', () => {
      return Person.query()
        .upsertGraph(
          {
            id: 1,
            pets: [
              {
                name: 'Peppa',
                species: 'pig',
              },
            ],
          },
          { noDelete: true },
        )
        .then(() => {
          return Person.query().findOne({ firstName: 'Jennifer' }).withGraphFetched('pets');
        })
        .then((jennifer) => {
          expect(jennifer.pets).toHaveLength(3);
          expect(jennifer.pets).toContainSubset([
            {
              name: 'Doggo',
              species: 'dog',
            },
            {
              name: 'Grumpy',
              species: 'cat',
            },
            {
              name: 'Peppa',
              species: 'pig',
            },
          ]);
        });
    });
  });
};
