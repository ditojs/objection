const { randomUUID } = require('crypto');
const { expect } = require('chai');
const { Model, val, raw } = require('../../../');

module.exports = (session) => {
  describe('Required properties given as query properties #2199', () => {
    let knex = session.knex;
    let Person;

    before(() => {
      return knex.schema.dropTableIfExists('Person').createTable('Person', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('age').notNullable();
      });
    });

    after(() => {
      return knex.schema.dropTableIfExists('Person');
    });

    before(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'Person';
        }

        static get jsonSchema() {
          return {
            type: 'object',
            required: ['name', 'age'],
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              age: { type: 'integer' },
            },
          };
        }
      };

      Person.knex(knex);
    });

    beforeEach(() => Person.query().delete());

    it('should insert required properties given as raw() and val()', async () => {
      await Person.query().insert({ name: val('Margot'), age: raw('40 + 2') });
      const people = await Person.query();
      expect(people).to.containSubset([{ name: 'Margot', age: 42 }]);
    });

    it('should insert required properties given as a subquery', async () => {
      await Person.query().insert({ name: 'Margot', age: knex.select(knex.raw('42')) });
      const people = await Person.query();
      expect(people).to.containSubset([{ name: 'Margot', age: 42 }]);
    });

    it('should still fail for missing required properties', async () => {
      try {
        await Person.query().insert({ name: raw('?', 'Margot') });
      } catch (err) {
        expect(err).to.be.an.instanceof(Person.ValidationError);
        expect(Object.keys(err.data)).to.eql(['age']);
        return;
      }
      throw new Error('should not get here');
    });

    if (session.isPostgres()) {
      describe('uuid[] column', () => {
        let Item;

        before(() => {
          return knex.schema.dropTableIfExists('Item').createTable('Item', (table) => {
            table.increments('id').primary();
            table.specificType('uuids', 'uuid[]').notNullable();
          });
        });

        after(() => {
          return knex.schema.dropTableIfExists('Item');
        });

        before(() => {
          Item = class Item extends Model {
            static get tableName() {
              return 'Item';
            }

            static get jsonSchema() {
              return {
                type: 'object',
                required: ['uuids'],
                properties: {
                  id: { type: 'integer' },
                  uuids: { type: 'array', items: { type: 'string' } },
                },
              };
            }
          };

          Item.knex(knex);
        });

        it('should insert a required uuid[] property given as val()', async () => {
          const uuids = [randomUUID(), randomUUID()];
          await Item.query().insert({ uuids: val(uuids).asArray().castTo('uuid[]') });
          const items = await Item.query();
          expect(items).to.containSubset([{ uuids }]);
        });
      });
    }
  });
};
