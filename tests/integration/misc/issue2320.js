import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('insert().onConflict().ignore() results #2320 #2597 #2661', () => {
    const { knex } = session;

    class Tag extends Model {
      static get tableName() {
        return 'onConflictTags';
      }

      static get jsonSchema() {
        return {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            meta: { type: ['object', 'null'] },
          },
        };
      }
    }

    beforeAll(() => {
      return knex.schema.dropTableIfExists('onConflictTags').createTable('onConflictTags', (t) => {
        t.increments('id').primary();
        t.string('name').unique();
        t.json('meta');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('onConflictTags');
    });

    beforeEach(async () => {
      await knex('onConflictTags').delete();
      await Tag.query(knex).insert({ name: 'a', meta: { v: 'original a' } });
      await Tag.query(knex).insert({ name: 'b', meta: { v: 'original b' } });
    });

    async function findTag(name) {
      return Tag.query(knex).findOne({ name });
    }

    it('should not assign an id to an ignored model', async () => {
      const tag = Tag.fromJson({ name: 'a' });
      const result = await Tag.query(knex).insert(tag).onConflict('name').ignore();

      expect(result).toBe(tag);
      expect(tag.id).toBeUndefined();
    });

    it('should assign the id to a model that is not ignored', async () => {
      const result = await Tag.query(knex).insert({ name: 'c' }).onConflict('name').ignore();

      expect(result.id).toBe((await findTag('c')).id);
    });

    it('insertAndFetch() should not fetch an ignored model without an id (#2661)', async () => {
      const result = await Tag.query(knex)
        .insertAndFetch({ name: 'a', meta: { v: 'new a' } })
        .onConflict('name')
        .ignore();

      expect(result.id).toBeUndefined();
      expect(result.name).toBe('a');
      expect(result.meta).toEqual({ v: 'new a' });
    });

    if (session.isPostgres()) {
      it('should merge the returned rows to the right models (#2320)', async () => {
        const tags = ['a', 'c', 'b', 'd'].map((name) => Tag.fromJson({ name }));
        const result = await Tag.query(knex).insert(tags).onConflict('name').ignore();

        expect(result).toHaveLength(4);
        expect(result.every((it, i) => it === tags[i])).toBe(true);
        expect(tags.map((it) => it.name)).toEqual(['a', 'c', 'b', 'd']);
        expect(tags[0].id).toBeUndefined();
        expect(tags[1].id).toBe((await findTag('c')).id);
        expect(tags[2].id).toBeUndefined();
        expect(tags[3].id).toBe((await findTag('d')).id);
      });

      it('should not crash with object properties in the jsonSchema (#2597)', async () => {
        const result = await Tag.query(knex)
          .insert([
            { name: 'c', meta: { v: 'new c' } },
            { name: 'a', meta: { v: 'new a' } },
          ])
          .onConflict('name')
          .ignore()
          .returning('*');

        expect(result.map((it) => it.id)).toEqual([(await findTag('c')).id, undefined]);
        expect(result.map((it) => it.meta)).toEqual([{ v: 'new c' }, { v: 'new a' }]);
      });

      it('insertAndFetch() should only fetch the models that have an id (#2661)', async () => {
        const result = await Tag.query(knex)
          .insertAndFetch([
            { name: 'a', meta: { v: 'new a' } },
            { name: 'c', meta: { v: 'new c' } },
          ])
          .onConflict('name')
          .ignore();

        expect(result.map((it) => it.id)).toEqual([undefined, (await findTag('c')).id]);
        expect(result.map((it) => it.meta)).toEqual([{ v: 'new a' }, { v: 'new c' }]);
      });
    }
  });
};
