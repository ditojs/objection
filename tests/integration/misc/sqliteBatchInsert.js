import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe.skipIf(!session.isSqlite())('insert() of several models on SQLite', () => {
    const { knex } = session;

    class Item extends Model {
      static get tableName() {
        return 'batch_insert_item';
      }
    }

    class Pair extends Model {
      static get tableName() {
        return 'batch_insert_pair';
      }

      static get idColumn() {
        return ['a', 'b'];
      }
    }

    const dropTables = () =>
      knex.schema.dropTableIfExists('batch_insert_item').dropTableIfExists('batch_insert_pair');

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('batch_insert_item', (table) => {
          table.increments('id');
          table.string('name').unique();
          table.text('data');
        })
        .createTable('batch_insert_pair', (table) => {
          table.integer('a');
          table.integer('b');
          table.string('name');
          table.primary(['a', 'b']);
        });
    });

    beforeEach(async () => {
      await knex('batch_insert_item').delete();
      await knex('batch_insert_pair').delete();
    });

    afterAll(dropTables);

    it('should store objects and arrays as JSON, in one row and in several', async () => {
      await Item.query(knex).insert({ name: 'a', data: [1, 2] });
      await Item.query(knex).insert([
        { name: 'b', data: { b: 1 } },
        { name: 'c', data: [3] },
      ]);

      expect(await knex('batch_insert_item').select('name', 'data').orderBy('name')).toEqual([
        { name: 'a', data: '[1,2]' },
        { name: 'b', data: '{"b":1}' },
        { name: 'c', data: '[3]' },
      ]);
    });

    it('should return the ids of the inserted rows with onConflict().ignore()', async () => {
      await knex('batch_insert_item').insert({ name: 'a' });

      const [a, b] = await Item.query(knex)
        .insert([{ name: 'a' }, { name: 'b' }])
        .onConflict('name')
        .ignore();

      expect(a.id).toBeUndefined();
      expect(b.id).toBe((await knex('batch_insert_item').where('name', 'b').first()).id);
    });

    it('should insert models with composite ids', async () => {
      const pairs = await Pair.query(knex).insert([
        { a: 1, b: 2, name: 'x' },
        { a: 2, b: 1, name: 'y' },
      ]);

      expect(pairs.map((pair) => pair.$id())).toEqual([
        [1, 2],
        [2, 1],
      ]);
      expect(await knex('batch_insert_pair').orderBy('a')).toHaveLength(2);
    });

    it('should not return anything for models with ids', () => {
      const sql = Item.query(knex)
        .insert([
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
        ])
        .toKnexQuery()
        .toString();

      expect(sql).not.toMatch(/returning/);
    });
  });
};
