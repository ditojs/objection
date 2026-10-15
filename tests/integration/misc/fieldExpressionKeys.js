import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model, ValidationError, snakeCaseMappers, raw, ref } from 'objection';

export default (session) => {
  describe('keys with a colon in insert(), patch(), update() and merge() data', () => {
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

          if (!session.isMsSql()) {
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
        ...(!session.isMsSql()
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

    it('insert() should reject undeclared keys with a colon', async () => {
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

      await expectRejected(
        Item.query().insert({ id: 2, 'ns:name': 'b', 'meta:color': 'red', 'meta:size': ref('id') }),
        ['meta:color', 'meta:size'],
      );
      await expectRejected(Item.fromJson({ id: 2, 'meta:color': 'red' }).$query().insert(), [
        'meta:color',
      ]);
      await expectRejected(Item.query().insertGraph({ id: 2, 'meta:color': 'red' }), [
        'meta:color',
      ]);
      await expectRejected(SchemalessItem.query(knex).insert({ id: 2, 'ns:name': 'b' }), [
        'ns:name',
      ]);

      expect(await knex('field_expression_keys').where('id', 2)).toEqual([]);
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

    it('insert(), patch() and update() should round-trip a declared key with a colon mapped by snakeCaseMappers', async () => {
      class SnakeCaseItem extends Item {
        static get columnNameMappers() {
          return snakeCaseMappers();
        }

        static get jsonSchema() {
          return {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              'ns:fooBar': { type: 'string' },
            },
          };
        }
      }

      const fetchRow = () => knex('field_expression_keys').where('id', 2).first();

      await SnakeCaseItem.query().insert({ id: 2, 'ns:fooBar': 'a' });
      expect((await fetchRow())['ns:foo_bar']).toBe('a');
      const item = await SnakeCaseItem.query().findById(2);
      expect(item['ns:fooBar']).toBe('a');
      await item.$query().patch({ 'ns:fooBar': 'b' });
      expect((await fetchRow())['ns:foo_bar']).toBe('b');
      await item.$query().update({ id: 2, 'ns:fooBar': 'c' });
      expect((await fetchRow())['ns:foo_bar']).toBe('c');
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

      it('insert(), update() and patch() should write a key with a colon that is not a field expression', async () => {
        await SchemalessItem.query(knex).insert({ id: 2, 'ns:': 'x' });
        expect(await fetchValue(2)).toBe('x');
        await SchemalessItem.query(knex).update({ id: 2, 'ns:': 'y' }).where('id', 2);
        expect(await fetchValue(2)).toBe('y');
        await SchemalessItem.query(knex).patch({ 'ns:': 'z' }).where('id', 2);
        expect(await fetchValue(2)).toBe('z');
      });

      it('upsertGraph() should fetch a key with a colon that is not a field expression', async () => {
        await SchemalessItem.query(knex).upsertGraph(
          { id: 2, 'ns:': 'x' },
          { insertMissing: true, fetchStrategy: 'OnlyNeeded' },
        );
        expect(await fetchValue(2)).toBe('x');
      });
    });

    if (!session.isMsSql()) {
      // MySQL and SQLite return json columns of raw rows as text.
      const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

      it('patch() should write an undeclared key with a colon to the json path', async () => {
        await Item.query().patch({ 'ns:name': 'd', 'meta:color': 'red' }).where('id', 1);
        const item = await Item.query().findById(1);
        expect(item['ns:name']).toBe('d');
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('patch() should write a json path into a NULL json column', async () => {
        await knex('field_expression_keys').where('id', 1).update({ meta: null });
        await Item.query().patch({ 'meta:color': 'red' }).where('id', 1);
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ color: 'red' });
      });

      it('patch() should write an undeclared key with a colon to the json path when built before', async () => {
        const query = Item.query().patch({ 'meta:color': 'red' }).where('id', 1);
        query.toKnexQuery();
        query.clone().toKnexQuery();
        expect(await query).toBe(1);
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('upsertGraph() should not return the undeclared keys with a colon', async () => {
        const item = await Item.query().upsertGraph({ id: 1, 'meta:color': 'red' });
        expect(item).not.toHaveProperty('meta:color');
      });

      it('patchAndFetchById() should not return the undeclared keys with a colon', async () => {
        const item = await Item.query().patchAndFetchById(1, { 'meta:color': 'red' });
        expect(item).not.toHaveProperty('meta:color');
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      it('$query().patch() should not set the keys with a colon mapped by snakeCaseMappers', async () => {
        class SnakeCaseItem extends Item {
          static get columnNameMappers() {
            return snakeCaseMappers();
          }
        }

        const item = await SnakeCaseItem.query().findById(1);
        await item.$query().patch({ 'extraMeta:color': 'red' });
        expect(item).not.toHaveProperty('extraMeta:color');
        const row = await knex('field_expression_keys').where('id', 1).first();
        expect(parseJson(row.extra_meta)).toEqual({ size: 1, color: 'red' });
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

      it('merge() should write an undeclared key with a colon to the json path when built before', async () => {
        const query = Item.query()
          .insert({ id: 1 })
          .onConflict('id')
          .merge({ 'meta:color': 'red' });
        query.toKnexQuery();
        await query;
        const item = await Item.query().findById(1);
        expect(item.meta).toEqual({ size: 1, color: 'red' });
      });

      // knex doesn't support aliases in inserts on MySQL.
      it.skipIf(session.isMySql())(
        'merge() should write a key with a colon to the json path of an aliased table',
        async () => {
          await Item.query()
            .alias('i')
            .insert({ id: 1 })
            .onConflict('id')
            .merge({ 'meta:color': 'red', 'meta:size': 2 });
          const item = await Item.query().findById(1);
          expect(item.meta).toEqual({ size: 2, color: 'red' });
        },
      );

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
        expect(parseJson(row.extra_meta)).toEqual({ size: 1, color: 'red' });
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
        expect(parseJson(row.meta)).toEqual({ size: 1, color: 'blue' });
      });
    }
  });

  describe.skipIf(session.isMsSql())('upsertGraph() with keys in json paths', () => {
    const { knex } = session;

    class Pet extends Model {
      static get tableName() {
        return 'json_key_pet';
      }

      static get jsonAttributes() {
        return ['data'];
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'json_key_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'json_key_person.id', to: 'json_key_pet.data:ownerId' },
          },
          sitted: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'json_key_person.id', to: 'json_key_pet.data:sitterId' },
          },
        };
      }
    }

    beforeAll(async () => {
      await knex.schema
        .dropTableIfExists('json_key_pet')
        .dropTableIfExists('json_key_person')
        .createTable('json_key_person', (table) => {
          table.integer('id').primary();
        })
        .createTable('json_key_pet', (table) => {
          table.integer('id').primary();
          table.jsonb('data');
        });
    });

    afterAll(() =>
      knex.schema.dropTableIfExists('json_key_pet').dropTableIfExists('json_key_person'),
    );

    // The places use different json paths of one column. The relate writes the
    // whole json column, so the unrelate shows in its query:
    it('should unrelate a row that another relation on another key keeps', async () => {
      await knex('json_key_person').insert([{ id: 1 }, { id: 2 }]);
      await knex('json_key_pet').insert({ id: 3, data: JSON.stringify({ ownerId: 1 }) });

      const queries = [];
      const onQuery = ({ sql }) => queries.push(sql);
      knex.on('query', onQuery);

      try {
        await Person.query(knex).upsertGraph(
          [
            { id: 1, pets: [] },
            { id: 2, sitted: [{ id: 3 }] },
          ],
          { relate: true },
        );
      } finally {
        knex.removeListener('query', onQuery);
      }

      expect(queries.filter((sql) => /^update .*ownerId/i.test(sql))).toHaveLength(1);
    });
  });
};
