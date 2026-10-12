import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model, snakeCaseMappers } from 'objection';

export default (session) => {
  describe('JSON attributes are parsed once, depending on the driver #205', () => {
    const { knex } = session;

    class Item extends Model {
      static get tableName() {
        return 'issue205Item';
      }

      static get jsonSchema() {
        return {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: ['string', 'null'] },
            meta: { type: ['object', 'string', 'null'] },
            data: { type: ['object', 'string', 'null'] },
          },
        };
      }

      static get relationMappings() {
        return {
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Item,
            join: {
              from: 'issue205Item.parentId',
              to: 'issue205Item.id',
            },
          },
        };
      }
    }

    // JSON strings that look like JSON:
    const values = ['123', 'true', 'null', '{"a":1}', { a: 1 }];

    beforeAll(() => {
      Item.knex(knex);

      return knex.schema.dropTableIfExists('issue205Item').createTable('issue205Item', (t) => {
        t.integer('id').primary();
        t.integer('parentId');
        t.string('title');
        t.jsonb('meta');
        // Holds JSON as text on all databases:
        t.text('data');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('issue205Item');
    });

    beforeEach(() => {
      return knex('issue205Item').delete();
    });

    // MySQL doesn't return the ids of several inserted rows:
    const insertItems = async (items) => {
      for (const item of items) {
        await Item.query().insert(item);
      }
    };

    it('should return the values of JSON columns unchanged', async () => {
      await insertItems(values.map((meta, index) => ({ id: index + 1, meta })));
      const items = await Item.query().orderBy('id');
      expect(items.map((item) => item.meta)).toEqual(values);
    });

    it('should return the values of JSON columns unchanged in withGraphJoined()', async () => {
      await insertItems(
        values.map((meta, index) => ({ id: index + 1, parentId: index + 1, meta })),
      );
      const items = await Item.query().withGraphJoined('parent').orderBy('issue205Item.id');
      expect(items.map((item) => item.parent.meta)).toEqual(values);
    });

    it('should write the values of JSON columns back unchanged', async () => {
      await Item.query().insert({ id: 1, meta: '123' });
      const item = await Item.query().findById(1);
      await item.$query().patch({ title: 'patched' });
      await item.$query().update(item);
      expect(await Item.query().findById(1)).toEqual(
        Item.fromJson({ id: 1, parentId: null, title: 'patched', meta: '123', data: null }),
      );
    });

    if (session.isPostgres()) {
      it('should merge the parsed rows of returning() into the models', async () => {
        const items = await Item.query()
          .insert(values.map((meta, index) => ({ id: index + 1, meta })))
          .returning('*');
        expect(items.map((item) => item.meta)).toEqual(values);
      });

      // `pg` returns JSON columns parsed, and text columns as text:
      it('should leave JSON in text columns as text', async () => {
        await knex('issue205Item').insert({ id: 1, data: '{"a":1}' });
        const item = await Item.query().findById(1);
        expect(item.data).toBe('{"a":1}');
      });
    } else {
      it('should parse JSON in text columns', async () => {
        await knex('issue205Item').insert({ id: 1, data: '{"a":1}' });
        const item = await Item.query().findById(1);
        expect(item.data).toEqual({ a: 1 });
      });

      it('should keep text in JSON columns that is not JSON', async () => {
        await knex('issue205Item').insert({ id: 1, data: 'not json' });
        const item = await Item.query().findById(1);
        expect(item.data).toBe('not json');
      });
    }

    it("should parse JSON text strictly with jsonColumnFormat 'text'", async () => {
      class TextItem extends Item {
        static jsonColumnFormat = 'text';
      }

      await knex('issue205Item').insert([
        { id: 1, data: '{"a":1}' },
        { id: 2, data: 'not json' },
      ]);
      expect((await TextItem.query().findById(1)).data).toEqual({ a: 1 });
      await expect(TextItem.query().findById(2)).rejects.toThrow(
        "Invalid JSON in JSON attribute 'data' of model 'TextItem'",
      );
    });

    it("should not parse JSON text with jsonColumnFormat 'parsed'", async () => {
      class ParsedItem extends Item {
        static jsonColumnFormat = 'parsed';
      }

      await knex('issue205Item').insert({ id: 1, data: '{"a":1}' });
      expect((await ParsedItem.query().findById(1)).data).toBe('{"a":1}');
    });

    it('should throw for an invalid jsonColumnFormat', async () => {
      class InvalidItem extends Item {
        static jsonColumnFormat = 'json';
      }

      await knex('issue205Item').insert({ id: 1 });
      await expect(InvalidItem.query().findById(1)).rejects.toThrow(
        "Invalid jsonColumnFormat of model 'InvalidItem': 'json'.",
      );
    });

    it('should call overrides of fromDatabaseJson() and $setDatabaseJson() with the options', async () => {
      const calls = [];

      class CustomItem extends Item {
        static fromDatabaseJson(json, options) {
          calls.push(['fromDatabaseJson', options.knex]);
          return super.fromDatabaseJson(json, options);
        }

        $setDatabaseJson(json, options) {
          calls.push(['$setDatabaseJson', options.knex]);
          return super.$setDatabaseJson(json, options);
        }
      }

      await insertItems([{ id: 1, meta: '123' }]);
      // Use a transaction, to tell the query's knex from the bound one:
      let queryKnex = null;
      const item = await knex.transaction((trx) => {
        queryKnex = trx;
        return CustomItem.query(trx).findById(1);
      });
      expect(item.meta).toBe('123');
      expect(calls).toEqual([
        ['fromDatabaseJson', queryKnex],
        ['$setDatabaseJson', queryKnex],
      ]);
    });

    it('should parse JSON text leniently for overrides that drop the options', async () => {
      class CustomItem extends Item {
        static fromDatabaseJson(json) {
          return super.fromDatabaseJson(json);
        }
      }

      await knex('issue205Item').insert({ id: 1, meta: JSON.stringify('{"a":1}'), data: 'text' });
      const item = await CustomItem.query().findById(1);
      expect(item.data).toBe('text');
      // Without the driver, JSON text is parsed once more:
      expect(item.meta).toEqual(session.isPostgres() ? { a: 1 } : '{"a":1}');
    });

    it('should not parse columns that are not JSON attributes', async () => {
      await knex('issue205Item').insert({ id: 1, title: '{"a":1}' });
      const item = await Item.query().findById(1);
      expect(item.title).toBe('{"a":1}');
    });
  });

  describe('JSON attributes are parsed by their property names #205', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'issue205Person';
      }

      static get columnNameMappers() {
        return snakeCaseMappers();
      }

      static get jsonAttributes() {
        return ['someData'];
      }

      static get relationMappings() {
        return {
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'issue205Person.id',
              through: {
                from: 'issue205PersonMovie.person_id',
                to: 'issue205PersonMovie.movie_id',
                extra: { linkData: 'link_data' },
              },
              to: 'issue205Movie.id',
            },
          },
        };
      }
    }

    class Movie extends Model {
      static get tableName() {
        return 'issue205Movie';
      }

      static get columnNameMappers() {
        return snakeCaseMappers();
      }

      static get jsonAttributes() {
        return ['linkData'];
      }
    }

    beforeAll(async () => {
      await knex.schema
        .dropTableIfExists('issue205PersonMovie')
        .dropTableIfExists('issue205Movie')
        .dropTableIfExists('issue205Person')
        .createTable('issue205Person', (t) => {
          t.integer('id').primary();
          t.json('some_data');
        })
        .createTable('issue205Movie', (t) => {
          t.integer('id').primary();
        })
        .createTable('issue205PersonMovie', (t) => {
          t.integer('person_id');
          t.integer('movie_id');
          t.json('link_data');
        });

      await knex('issue205Person').insert({ id: 1, some_data: '{"a":1}' });
      await knex('issue205Movie').insert({ id: 1 });
      await knex('issue205PersonMovie').insert({ person_id: 1, movie_id: 1, link_data: '{"b":2}' });
    });

    afterAll(() => {
      return knex.schema
        .dropTableIfExists('issue205PersonMovie')
        .dropTableIfExists('issue205Movie')
        .dropTableIfExists('issue205Person');
    });

    it('should parse the JSON extras of many-to-many relations', async () => {
      const person = await Person.query(knex).findById(1).withGraphFetched('movies');
      expect(person.movies[0].linkData).toEqual({ b: 2 });
    });

    it('should parse the JSON extras of many-to-many relations in withGraphJoined()', async () => {
      const person = await Person.query(knex).findById(1).withGraphJoined('movies');
      expect(person.movies[0].linkData).toEqual({ b: 2 });
    });

    it('should parse JSON columns selected under their property names', async () => {
      const person = await Person.query(knex).select('id', 'some_data as someData').findById(1);
      expect(person.someData).toEqual({ a: 1 });
    });
  });
};
