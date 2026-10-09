const { Model } = require('../../../');
const { expect } = require('chai');

module.exports = (session) => {
  describe(`upsertGraph should not consider JSON values loosely equal to primitives #1874`, () => {
    let knex = session.knex;
    let Item;
    let updates;

    before(() => {
      return knex.schema
        .dropTableIfExists('issue1874_items')
        .createTable('issue1874_items', (table) => {
          table.integer('id').primary();
          table.boolean('flag');
          table.text('data');
        });
    });

    after(() => {
      return knex.schema.dropTableIfExists('issue1874_items');
    });

    before(() => {
      Item = class Item extends Model {
        static get tableName() {
          return 'issue1874_items';
        }

        static get jsonAttributes() {
          return ['data'];
        }

        $beforeUpdate() {
          updates++;
        }
      };

      Item.knex(knex);
    });

    beforeEach(async () => {
      updates = 0;
      await knex('issue1874_items').delete();
      await Item.query().insert({ id: 1, flag: true, data: false });
    });

    it('should update `false` to `[]`', async () => {
      await Item.query().upsertGraph({ id: 1, data: [] });
      const item = await Item.query().findById(1);

      expect(updates).to.equal(1);
      expect(item.data).to.eql([]);
    });

    it('should update `[]` to `false`', async () => {
      await Item.query().patch({ data: [] });
      await Item.query().upsertGraph({ id: 1, data: false });
      const item = await Item.query().findById(1);

      expect(updates).to.equal(2);
      expect(item.data).to.equal(false);
    });

    it('should still consider loosely equal primitives unchanged', async () => {
      await Item.query().upsertGraph({ id: 1, flag: 1, data: false });

      expect(updates).to.equal(0);
    });
  });
};
