import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe(`selects in relationMapping filters don't work #1074`, () => {
    let knex = session.knex;
    let Person;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('cousins')
        .dropTableIfExists('persons')
        .createTable('persons', (table) => {
          table.increments('id').primary();
          table.integer('parentId');
          table.string('name');
        })
        .createTable('cousins', (table) => {
          table.integer('id1');
          table.integer('id2');
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('cousins').dropTableIfExists('persons');
    });

    beforeAll(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'persons';
        }

        static get relationMappings() {
          return {
            parent: {
              relation: Model.BelongsToOneRelation,
              modelClass: Person,
              modify: (builder) => builder.select('name'),
              join: {
                from: 'persons.parentId',
                to: 'persons.id',
              },
            },

            cousins: {
              relation: Model.ManyToManyRelation,
              modelClass: Person,
              modify: (builder) => builder.select('name'),
              join: {
                from: 'persons.id',
                through: {
                  from: 'cousins.id1',
                  to: 'cousins.id2',
                },
                to: 'persons.id',
              },
            },
          };
        }
      };

      Person.knex(knex);
    });

    beforeEach(() => Person.query().delete());
    beforeEach(() => {
      return Person.query().insertGraph({
        name: 'Matti',

        parent: {
          name: 'Teppo',
        },

        cousins: [
          {
            name: 'Seppo',
          },
          {
            name: 'Taakko',
          },
        ],
      });
    });

    it('test', () => {
      return Person.query()
        .withGraphFetched({ parent: true, cousins: true })
        .where('name', 'Matti')
        .then((result) => {
          expect(Object.keys(result[0].parent)).toEqual(['name']);
          expect(Object.keys(result[0].cousins[0])).toEqual(['name']);
        });
    });
  });
};
