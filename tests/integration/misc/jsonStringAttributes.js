const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  describe('JSON attributes holding strings that look like JSON', () => {
    const { knex } = session;

    class Item extends Model {
      static get tableName() {
        return 'jsonStringAttributesItem';
      }

      static get jsonSchema() {
        return {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            json: { type: ['object', 'string'] },
            text: { type: ['object', 'string'] },
          },
        };
      }
    }

    before(() => {
      return knex.schema
        .dropTableIfExists('jsonStringAttributesItem')
        .createTable('jsonStringAttributesItem', (table) => {
          table.increments('id');
          table.json('json');
          table.text('text');
        });
    });

    after(() => {
      return knex.schema.dropTableIfExists('jsonStringAttributesItem');
    });

    for (const value of ['123', 'true', 'null', '[1]', 'abc', { a: 1 }]) {
      it(`should read and write back ${JSON.stringify(value)}`, async () => {
        const { id } = await Item.query(knex).insert({ json: value, text: value });
        const item = await Item.query(knex).findById(id);
        expect(item.json).to.eql(value);
        expect(item.text).to.eql(value);

        await item.$query(knex).patch({ json: item.json, text: item.text });
        const patched = await Item.query(knex).findById(id);
        expect(patched.json).to.eql(value);
        expect(patched.text).to.eql(value);
      });
    }
  });
};
