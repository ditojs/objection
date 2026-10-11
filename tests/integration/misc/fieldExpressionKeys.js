import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model, ValidationError, snakeCaseMappers, raw, ref } from 'objection';

export default (session) => {
  describe('keys with a colon in patch() and update() data', () => {
    let knex = session.knex;
    let Item;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('field_expression_keys')
        .createTable('field_expression_keys', (table) => {
          table.integer('id').primary();
          table.string('ns:name');
          table.string('ns:foo_bar');

          if (session.isPostgres()) {
            table.jsonb('meta');
          }
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('field_expression_keys');
    });

    beforeAll(() => {
      Item = class Item extends Model {
        static get tableName() {
          return 'field_expression_keys';
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              'ns:name': { type: 'string' },
              meta: {
                type: 'object',
                properties: {
                  size: { type: 'integer' },
                  color: { type: 'string' },
                },
              },
            },
          };
        }
      };

      Item.knex(knex);
    });

    beforeEach(async () => {
      await knex('field_expression_keys').delete();
      await knex('field_expression_keys').insert({
        id: 1,
        'ns:name': 'a',
        ...(session.isPostgres() ? { meta: JSON.stringify({ size: 1 }) } : {}),
      });
    });

    it('patch() should write a declared key with a colon to its column', async () => {
      await Item.query().patch({ 'ns:name': 'b' }).where('id', 1);
      const item = await Item.query().findById(1);
      expect(item['ns:name']).toBe('b');
    });

    it('update() should write a declared key with a colon to its column', async () => {
      await Item.query().update({ id: 1, 'ns:name': 'c' }).where('id', 1);
      const item = await Item.query().findById(1);
      expect(item['ns:name']).toBe('c');
    });

    it('update() should write a declared key with a colon given as a query property', async () => {
      await Item.query()
        .update({ id: 1, 'ns:name': raw('?', 'q') })
        .where('id', 1);
      const item = await Item.query().findById(1);
      expect(item['ns:name']).toBe('q');
    });

    it('update() should reject undeclared keys with a colon', async () => {
      class SchemalessItem extends Model {
        static get tableName() {
          return 'field_expression_keys';
        }
      }

      const expectRejected = async (query, keys) => {
        const err = await query.catch((err) => err);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.type).toBe('ModelValidation');
        expect(Object.keys(err.data)).toEqual(keys);
      };

      const item = await Item.query().findById(1);
      await expectRejected(
        Item.query().update({ id: 1, 'ns:name': 'b', 'meta:color': 'red', 'meta:size': ref('id') }),
        ['meta:color', 'meta:size'],
      );
      await expectRejected(item.$query().update({ id: 1, 'meta:color': 'red' }), ['meta:color']);
      await expectRejected(Item.fromJson({ id: 1, 'meta:color': 'red' }).$query().update(), [
        'meta:color',
      ]);
      await expectRejected(SchemalessItem.query(knex).update({ id: 1, 'ns:name': 'b' }), [
        'ns:name',
      ]);

      const row = await knex('field_expression_keys').where('id', 1).first();
      expect(row['ns:name']).toBe('a');
    });

    it('patch() should write a declared key with a colon mapped by snakeCaseMappers', async () => {
      class SnakeCaseItem extends Item {
        static get columnNameMappers() {
          return snakeCaseMappers();
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              'ns:foo_bar': { type: 'string' },
            },
          };
        }
      }

      await SnakeCaseItem.query().patch({ 'ns:foo_bar': 'b' }).where('id', 1);
      const row = await knex('field_expression_keys').where('id', 1).first();
      expect(row['ns:foo_bar']).toBe('b');
    });

    it('patch() should not parse the keys with a colon as database json', async () => {
      class StrictItem extends Item {
        $parseDatabaseJson() {
          throw new Error('unexpected $parseDatabaseJson() call');
        }
      }

      await StrictItem.query().patch({ 'ns:name': 'b' }).where('id', 1);
      const item = await Item.query().findById(1);
      expect(item['ns:name']).toBe('b');
    });

    if (session.isPostgres()) {
      it('patch() should write an undeclared key with a colon to the json path', async () => {
        await Item.query().patch({ 'ns:name': 'd', 'meta:color': 'red' }).where('id', 1);
        const item = await Item.query().findById(1);
        expect(item['ns:name']).toBe('d');
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('patch() should not parse the keys of models without a schema as database json', async () => {
        class SchemalessItem extends Model {
          static get tableName() {
            return 'field_expression_keys';
          }

          $parseDatabaseJson() {
            throw new Error('unexpected $parseDatabaseJson() call');
          }
        }

        await SchemalessItem.query(knex).patch({ 'meta:color': 'blue' }).where('id', 1);
        const row = await knex('field_expression_keys').where('id', 1).first();
        expect(row.meta).toEqual({ size: 1, color: 'blue' });
      });
    }
  });
};
