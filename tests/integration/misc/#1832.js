const { Model } = require('../../../');
const { expect } = require('chai');
const { resetDeprecations } = require('../../../lib/utils/deprecate');

module.exports = (session) => {
  describe('warn when fetching relations of owners without join properties #1832', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'issue1832Person';
      }
    }

    class Animal extends Model {
      static get tableName() {
        return 'issue1832Animal';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: {
              from: 'issue1832Animal.ownerId',
              to: 'issue1832Person.id',
            },
          },
        };
      }
    }

    let warnings;
    let originalWarn;

    before(async () => {
      await knex.schema
        .dropTableIfExists('issue1832Animal')
        .dropTableIfExists('issue1832Person')
        .createTable('issue1832Person', (t) => {
          t.integer('id').primary();
          t.string('name');
        })
        .createTable('issue1832Animal', (t) => {
          t.integer('id').primary();
          t.integer('ownerId');
          t.string('name');
        });

      await knex('issue1832Person').insert({ id: 1, name: 'Jennifer' });
      await knex('issue1832Animal').insert([
        { id: 1, ownerId: 1, name: 'Doggo' },
        { id: 2, ownerId: null, name: 'Stray' },
      ]);
    });

    after(async () => {
      await knex.schema.dropTableIfExists('issue1832Animal').dropTableIfExists('issue1832Person');
    });

    beforeEach(() => {
      resetDeprecations();
      warnings = [];
      originalWarn = console.warn;
      console.warn = (message) => warnings.push(message);
    });

    afterEach(() => {
      console.warn = originalWarn;
      resetDeprecations();
    });

    const expectedWarning =
      'Fetching relation "owner" of Animal: some owner models are missing the join property ' +
      '"issue1832Animal.ownerId", so no related models are found for them. ' +
      'Select the column in the owner query.';

    it('$fetchGraph() should warn if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex).findById(1).select('id', 'name');
      await doggo.$fetchGraph('owner', { transaction: knex });

      expect(doggo.owner).to.equal(null);
      expect(warnings).to.eql([expectedWarning]);
    });

    it('$relatedQuery() should warn if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex).findById(1).select('id', 'name');
      const owner = await doggo.$relatedQuery('owner', knex);

      expect(owner).to.equal(undefined);
      expect(warnings).to.eql([expectedWarning]);
    });

    it('should only warn once per relation', async () => {
      const animals = await Animal.query(knex).select('id', 'name');
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });

      expect(warnings).to.eql([expectedWarning]);
    });

    it('should not warn if the foreign key is selected or null', async () => {
      const animals = await Animal.query(knex).orderBy('id');
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });

      expect(animals.map((it) => it.owner && it.owner.name)).to.eql(['Jennifer', null]);
      expect(warnings).to.eql([]);
    });

    it('withGraphFetched() should not warn if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex)
        .findById(1)
        .select('id', 'name')
        .withGraphFetched('owner');

      expect(doggo.owner.name).to.equal('Jennifer');
      expect(warnings).to.eql([]);
    });
  });
};
