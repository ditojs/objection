import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model, snakeCaseMappers, raw, ref } from 'objection';

export default (session) => {
  describe('keys with a colon in patch(), update() and merge() data', () => {
    let knex = session.knex;
    let Item;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('field_expression_keys')
        .createTable('field_expression_keys', (table) => {
          table.integer('id').primary();
          table.string('ns:name');
          table.string('ns:foo_bar');
          table.string('ns:');

          if (session.isPostgres()) {
            table.jsonb('meta');
            table.jsonb('extra_meta');
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
        ...(session.isPostgres()
          ? { meta: JSON.stringify({ size: 1 }), extra_meta: JSON.stringify({ size: 1 }) }
          : {}),
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

    describe('without a schema', () => {
      class SchemalessItem extends Model {
        static get tableName() {
          return 'field_expression_keys';
        }
      }

      const fetchValue = async (id) =>
        (await knex('field_expression_keys').where('id', id).first())['ns:'];

      it('insert() should write a key with a colon that is not a field expression given as a query property of an instance', async () => {
        await SchemalessItem.query(knex).insert(
          SchemalessItem.fromJson({ id: 2, 'ns:': raw('?', 'x') }),
        );
        expect(await fetchValue(2)).toBe('x');
      });

      it('upsertGraph() should fetch a key with a colon that is not a field expression', async () => {
        await SchemalessItem.query(knex).upsertGraph(
          { id: 2, 'ns:': 'x' },
          { insertMissing: true, fetchStrategy: 'OnlyNeeded' },
        );
        expect(await fetchValue(2)).toBe('x');
      });
    });

    if (session.isPostgres()) {
      it('patch() should write an undeclared key with a colon to the json path', async () => {
        await Item.query().patch({ 'ns:name': 'd', 'meta:color': 'red' }).where('id', 1);
        const item = await Item.query().findById(1);
        expect(item['ns:name']).toBe('d');
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('update() should write an undeclared key with a query property to the json path', async () => {
        await Item.query()
          .update({ id: 1, 'ns:name': 'e', 'meta:color': ref('id') })
          .where('id', 1);
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ size: 1, color: 1 });
      });

      it('patch() should pick an undeclared key with a colon by its json column with pickJsonSchemaProperties', async () => {
        class PickItem extends Item {
          static get pickJsonSchemaProperties() {
            return true;
          }
        }

        expect(await PickItem.query().patch({ 'meta:color': 'red' }).where('id', 1)).toBe(1);
        await PickItem.query()
          .patch({ 'ns:name': 'f', 'meta:size': 2, 'other:a': 1 })
          .where('id', 1);
        const item = await Item.query().findById(1);
        expect(item['ns:name']).toBe('f');
        expect(item.meta).toEqual({ size: 2, color: 'red' });
      });

      it('upsertGraph() should write an undeclared key with a colon to the json path', async () => {
        await Item.query().upsertGraph({ id: 1, 'meta:color': 'red' });
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('upsertGraph() should write an undeclared key with a colon to the json path with pickJsonSchemaProperties', async () => {
        class PickItem extends Item {
          static get pickJsonSchemaProperties() {
            return true;
          }
        }

        await PickItem.query().upsertGraph({ id: 1, 'ns:name': 'g', 'meta:color': 'red' });
        const item = await Item.query().findById(1);
        expect(item['ns:name']).toBe('g');
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('merge() should write an undeclared key with a colon to the json path', async () => {
        await Item.query().insert({ id: 1 }).onConflict('id').merge({ 'meta:color': 'red' });
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('merge() should write a key with a colon to the json path of an aliased table', async () => {
        await Item.query()
          .alias('i')
          .insert({ id: 1 })
          .onConflict('id')
          .merge({ 'meta:color': 'red', 'meta:size': 2 });
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ size: 2, color: 'red' });
      });

      it('merge() should write a key with a colon mapped by snakeCaseMappers to the json path', async () => {
        class SnakeCaseItem extends Item {
          static get columnNameMappers() {
            return snakeCaseMappers();
          }
        }

        await SnakeCaseItem.query()
          .insert({ id: 1 })
          .onConflict('id')
          .merge({ 'extraMeta:color': 'red' });
        const row = await knex('field_expression_keys').where('id', 1).first();
        expect(row.extra_meta).toEqual({ size: 1, color: 'red' });
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
