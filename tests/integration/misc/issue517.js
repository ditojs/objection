import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph with compound key in relation #517', () => {
    let knex = session.knex;
    let Users;
    let Preferences;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('Users')
        .dropTableIfExists('Preferences')
        .createTable('Users', (table) => {
          table.integer('id').primary();
        })
        .createTable('Preferences', (table) => {
          table.integer('userId');
          table.string('category', 16);
          table.string('setting');
          table.primary(['userId', 'category']);
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('Preferences').dropTableIfExists('Users');
    });

    beforeAll(() => {
      Users = class Users extends Model {
        static get tableName() {
          return 'Users';
        }

        static get relationMappings() {
          return {
            preferences: {
              relation: Model.HasManyRelation,
              modelClass: Preferences,
              join: {
                from: 'Preferences.userId',
                to: 'Users.id',
              },
            },
          };
        }
      };

      Preferences = class Preferences extends Model {
        static get tableName() {
          return 'Preferences';
        }

        static get idColumn() {
          return ['userId', 'category'];
        }
      };

      Users.knex(knex);
      Preferences.knex(knex);
    });

    beforeAll(() => {
      return Users.query().insert({
        id: 1,
      });
    });

    it('test', () => {
      const preferences = [
        {
          category: 'sms',
          setting: 'off',
        },
        {
          category: 'sound',
          setting: 'off',
        },
      ];

      return Users.query()
        .upsertGraph({ id: 1, preferences }, { insertMissing: true })
        .then(() => {
          return Users.query()
            .withGraphFetched('preferences')
            .modifyGraph('preferences', (qb) => qb.orderBy('category'));
        })
        .then((users) => {
          expect(users).toEqual([
            {
              id: 1,

              preferences: [
                {
                  category: 'sms',
                  setting: 'off',
                  userId: 1,
                },
                {
                  category: 'sound',
                  setting: 'off',
                  userId: 1,
                },
              ],
            },
          ]);
        });
    });
  });
};
