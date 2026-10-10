import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe(`modifiers that have no where or select statements don't work with joinRelated #712`, () => {
    let knex = session.knex;
    let Person;

    beforeAll(() => {
      return knex.schema.dropTableIfExists('Person').createTable('Person', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.integer('parentId');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('Person');
    });

    beforeAll(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'Person';
        }

        static get modifiers() {
          return {
            notFirstChild: (builder) => {
              builder.from((subQuery) => {
                subQuery
                  .select('Person.*')
                  .from('Person')
                  .where('name', '!=', 'child 1')
                  .as('Person');
              });
            },
          };
        }

        static get relationMappings() {
          return {
            children: {
              relation: Model.HasManyRelation,
              modelClass: Person,
              join: {
                from: 'Person.id',
                to: 'Person.parentId',
              },
            },
          };
        }
      };

      Person.knex(knex);
    });

    beforeAll(() => {
      return Person.query().insertGraph({
        id: 1,
        name: 'parent',
        children: [
          {
            id: 2,
            name: 'child 1',
          },
          {
            id: 3,
            name: 'child 2',
          },
        ],
      });
    });

    it('test', () => {
      return Person.query()
        .where('Person.id', 1)
        .select('Person.*', 'children.name as childName')
        .joinRelated('children(notFirstChild)')
        .orderBy('childName')
        .then((people) => {
          expect(people).toHaveLength(1);
          expect(people[0].childName).toBe('child 2');
        });
    });
  });
};
