import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Knex from 'knex';
import { Model, knexSnakeCaseMappers } from 'objection';

export default (session) => {
  describe('throw when fetched related models are missing join properties #2258', () => {
    let knex;

    class Registration extends Model {
      static get tableName() {
        return 'issue_2258_registration';
      }
    }

    class Role extends Model {
      static get tableName() {
        return 'issue_2258_role';
      }
    }

    // Only keeps the known columns, which also removes the owner join column
    // selected from the join table.
    class StrictRole extends Role {
      $parseDatabaseJson(json) {
        const { id, name } = super.$parseDatabaseJson(json);
        return { id, name };
      }
    }

    const rolesRelation = (modelClass) => ({
      relation: Model.ManyToManyRelation,
      modelClass,
      join: {
        from: 'issue_2258_user.id',
        through: {
          from: 'issue_2258_user_role.userId',
          to: 'issue_2258_user_role.roleId',
        },
        to: 'issue_2258_role.id',
      },
    });

    class User extends Model {
      static get tableName() {
        return 'issue_2258_user';
      }

      static get relationMappings() {
        return {
          // snake_case join columns don't match the camelCase properties
          // produced by `knexSnakeCaseMappers`.
          snakeRegistrations: {
            relation: Model.HasManyRelation,
            modelClass: Registration,
            join: {
              from: 'issue_2258_user.id',
              to: 'issue_2258_registration.user_id',
            },
          },

          camelRegistrations: {
            relation: Model.HasManyRelation,
            modelClass: Registration,
            join: {
              from: 'issue_2258_user.id',
              to: 'issue_2258_registration.userId',
            },
          },

          roles: rolesRelation(Role),
          strictRoles: rolesRelation(StrictRole),
        };
      }
    }

    beforeAll(async () => {
      knex = Knex({ ...session.opt.knexConfig, ...knexSnakeCaseMappers() });

      await session.knex.schema
        .dropTableIfExists('issue_2258_user_role')
        .dropTableIfExists('issue_2258_role')
        .dropTableIfExists('issue_2258_registration')
        .dropTableIfExists('issue_2258_user')
        .createTable('issue_2258_user', (t) => {
          t.integer('id').primary();
        })
        .createTable('issue_2258_registration', (t) => {
          t.integer('id').primary();
          t.integer('user_id');
        })
        .createTable('issue_2258_role', (t) => {
          t.integer('id').primary();
          t.string('name');
        })
        .createTable('issue_2258_user_role', (t) => {
          t.integer('user_id');
          t.integer('role_id');
        });

      await session.knex('issue_2258_user').insert({ id: 1 });
      await session.knex('issue_2258_registration').insert({ id: 1, user_id: 1 });
      await session.knex('issue_2258_role').insert({ id: 1, name: 'admin' });
      await session.knex('issue_2258_user_role').insert({ user_id: 1, role_id: 1 });
    });

    afterAll(async () => {
      await session.knex.schema
        .dropTableIfExists('issue_2258_user_role')
        .dropTableIfExists('issue_2258_role')
        .dropTableIfExists('issue_2258_registration')
        .dropTableIfExists('issue_2258_user');

      await knex.destroy();
    });

    const missingPropError =
      'Unable to fetch relation "snakeRegistrations" of User: some related models are missing ' +
      'the join property "issue_2258_registration.user_id". Check that the relation mapping ' +
      'uses the property names of the models, e.g. camelCase names when using ' +
      'knexSnakeCaseMappers.';

    it('withGraphFetched() should throw if related models are missing the join property', async () => {
      await expect(
        User.query(knex).findById(1).withGraphFetched('snakeRegistrations'),
      ).rejects.toThrow(missingPropError);
    });

    it('$fetchGraph() should throw if related models are missing the join property', async () => {
      const user = await User.query(knex).findById(1);

      await expect(user.$fetchGraph('snakeRegistrations', { transaction: knex })).rejects.toThrow(
        missingPropError,
      );
    });

    it('should not throw if related models have the join property', async () => {
      const user = await User.query(knex).findById(1).withGraphFetched('camelRegistrations');

      expect(user.camelRegistrations.map((it) => it.id)).toEqual([1]);
    });

    it('should throw if related models of a ManyToManyRelation are missing the owner join column', async () => {
      await expect(User.query(knex).findById(1).withGraphFetched('strictRoles')).rejects.toThrow(
        'Unable to fetch relation "strictRoles" of User: some related models are missing the ' +
          'join table column "issue_2258_user_role.userId" selected as "objectiontmpjoin0". ' +
          'Check that $parseDatabaseJson() and the column name mappers of the related model ' +
          'keep it.',
      );
    });

    it('should not throw if related models of a ManyToManyRelation have the owner join column', async () => {
      const user = await User.query(knex).findById(1).withGraphFetched('roles');

      expect(user.roles.map((it) => it.toJSON())).toEqual([{ id: 1, name: 'admin' }]);
    });
  });
};
