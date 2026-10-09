const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  describe('HasOneThroughRelation with the related table as the join table #1803', () => {
    let knex = session.knex;
    let Form;
    let User;

    before(() => {
      return knex.schema
        .dropTableIfExists('forms_1803')
        .dropTableIfExists('users_1803')
        .createTable('users_1803', (table) => {
          table.integer('id').primary();
          table.string('username');
          table.string('managerUsername');
          table.string('role');
        })
        .createTable('forms_1803', (table) => {
          table.integer('id').primary();
          table.integer('employeeId');
        });
    });

    after(() => {
      return knex.schema.dropTableIfExists('forms_1803').dropTableIfExists('users_1803');
    });

    before(() => {
      User = class User extends Model {
        static get tableName() {
          return 'users_1803';
        }
      };

      Form = class Form extends Model {
        static get tableName() {
          return 'forms_1803';
        }

        static get relationMappings() {
          return {
            manager: {
              relation: Model.HasOneThroughRelation,
              modelClass: User,
              join: {
                from: 'forms_1803.employeeId',
                // When the join table is the related table, `through.from`
                // is the column that points to the related table.
                through: {
                  from: 'users_1803.managerUsername',
                  to: 'users_1803.id',
                },
                to: 'users_1803.username',
              },
            },

            managerWithRole: {
              relation: Model.HasOneThroughRelation,
              modelClass: User,
              join: {
                from: 'forms_1803.employeeId',
                through: {
                  from: 'users_1803.managerUsername',
                  to: 'users_1803.id',
                  extra: { employeeRole: 'role' },
                },
                to: 'users_1803.username',
              },
            },
          };
        }
      };

      User.knex(knex);
      Form.knex(knex);
    });

    const users = [
      { id: 1, username: 'boss', managerUsername: null, role: 'ceo' },
      { id: 2, username: 'manager', managerUsername: 'boss', role: 'cto' },
      { id: 3, username: 'employee', managerUsername: 'manager', role: 'dev' },
    ];

    beforeEach(async () => {
      await knex('forms_1803').delete();
      await knex('users_1803').delete();
      await knex('users_1803').insert(users);
      await knex('forms_1803').insert([
        { id: 1, employeeId: 3 },
        { id: 2, employeeId: 2 },
        { id: 3, employeeId: 1 },
      ]);
    });

    it('withGraphFetched', async () => {
      const forms = await Form.query().withGraphFetched('manager').orderBy('id');

      expect(forms.map((form) => form.manager && form.manager.username)).to.eql([
        'manager',
        'boss',
        null,
      ]);
    });

    it('withGraphJoined', async () => {
      const forms = await Form.query().withGraphJoined('manager').orderBy('forms_1803.id');

      expect(forms.map((form) => form.manager && form.manager.username)).to.eql([
        'manager',
        'boss',
        null,
      ]);
    });

    it('$relatedQuery', async () => {
      const form = await Form.query().findById(1);
      const manager = await form.$relatedQuery('manager');

      expect(manager.username).to.equal('manager');
    });

    it('$relatedQuery with an alias', async () => {
      const form = await Form.query().findById(2);
      const manager = await form.$relatedQuery('manager').alias('m').where('m.id', '>', 0);

      expect(manager.username).to.equal('boss');
    });

    it('relatedQuery', async () => {
      const forms = await Form.query()
        .select('id', Form.relatedQuery('manager').select('manager.username').as('managerUsername'))
        .orderBy('id');

      expect(forms.map((form) => form.managerUsername)).to.eql(['manager', 'boss', null]);
    });

    it('withGraphFetched with extra properties', async () => {
      const forms = await Form.query().withGraphFetched('managerWithRole').orderBy('id');

      expect(forms.map((form) => form.managerWithRole && form.managerWithRole.employeeRole)).to.eql(
        ['dev', 'cto', null],
      );
    });

    it('upsertGraph with unchanged extra properties', async () => {
      await Form.query().upsertGraph({
        id: 1,
        managerWithRole: { id: 2, employeeRole: 'dev' },
      });

      await expectUsersUnchanged();
    });

    it('$relatedQuery patch', async () => {
      const form = await Form.query().findById(1);

      expect(await form.$relatedQuery('manager').patch({ role: 'cfo' })).to.equal(1);
      await expectUsers([1, 'ceo'], [2, 'cfo'], [3, 'dev']);
    });

    it('$relatedQuery delete', async () => {
      const form = await Form.query().findById(1);

      expect(await form.$relatedQuery('manager').delete()).to.equal(1);
      await expectUsers([1, 'ceo'], [3, 'dev']);
    });

    it('relatedQuery delete', async () => {
      expect(await Form.relatedQuery('manager').for(2).delete()).to.equal(1);
      await expectUsers([2, 'cto'], [3, 'dev']);
    });

    it('$relatedQuery patch with extra properties should fail', async () => {
      const form = await Form.query().findById(1);

      await expectError(
        form.$relatedQuery('managerWithRole').patch({ employeeRole: 'ops' }),
        'patch with extra properties is not supported',
      );

      await expectUsersUnchanged();
    });

    it('$relatedQuery unrelate should fail', async () => {
      const form = await Form.query().findById(1);

      await expectError(form.$relatedQuery('manager').unrelate(), 'unrelate is not supported');

      await expectUsersUnchanged();
    });

    it('relatedQuery unrelate should fail', async () => {
      await expectError(
        Form.relatedQuery('manager').for(1).unrelate(),
        'unrelate is not supported',
      );

      await expectUsersUnchanged();
    });

    async function expectError(query, message = '') {
      let error = null;

      try {
        await query;
      } catch (err) {
        error = err;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(error.message).to.contain(message);
    }

    async function expectUsers(...expected) {
      const rows = await knex('users_1803').orderBy('id');
      expect(rows.map((row) => [row.id, row.role])).to.eql(expected);
    }

    function expectUsersUnchanged() {
      return expectUsers(...users.map((user) => [user.id, user.role]));
    }
  });
};
