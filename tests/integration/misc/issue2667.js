import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Model, ref } from 'objection';
import { resetDeprecations } from '../../../lib/utils/deprecate.js';

export default (session) => {
  describe('warn when a relation owner join property holds an array #2667', () => {
    const { knex } = session;

    class Tag extends Model {
      static get tableName() {
        return 'issue2667Tag';
      }
    }

    class Post extends Model {
      static get tableName() {
        return 'issue2667Post';
      }

      static get jsonAttributes() {
        return ['tagIds', 'data'];
      }

      static get relationMappings() {
        return {
          tags: {
            relation: Model.HasManyRelation,
            modelClass: Tag,
            join: {
              from: 'issue2667Post.tagIds',
              to: 'issue2667Tag.id',
            },
          },

          compositeTags: {
            relation: Model.HasManyRelation,
            modelClass: Tag,
            join: {
              from: ['issue2667Post.id', 'issue2667Post.kind'],
              to: ['issue2667Tag.postId', 'issue2667Tag.kind'],
            },
          },

          ...(session.isPostgres() && {
            jsonRefTag: {
              relation: Model.BelongsToOneRelation,
              modelClass: Tag,
              join: {
                from: ref('issue2667Post.data:tagId').castInt(),
                to: 'issue2667Tag.id',
              },
            },
          }),
        };
      }
    }

    let warnings;
    let originalWarn;

    beforeAll(async () => {
      Tag.knex(knex);
      Post.knex(knex);

      await knex.schema
        .dropTableIfExists('issue2667Post')
        .dropTableIfExists('issue2667Tag')
        .createTable('issue2667Tag', (t) => {
          t.integer('id').primary();
          t.integer('postId');
          t.string('kind');
        })
        .createTable('issue2667Post', (t) => {
          t.integer('id').primary();
          t.string('kind');
          t.text('tagIds');

          if (session.isPostgres()) {
            t.jsonb('data');
          } else {
            t.text('data');
          }
        });

      await knex('issue2667Tag').insert([
        { id: 1, postId: 1, kind: 'a' },
        { id: 2, postId: 1, kind: 'b' },
        { id: 3, postId: 2, kind: 'a' },
      ]);

      await knex('issue2667Post').insert([
        { id: 1, kind: 'a', tagIds: '[1,2]', data: '{"tagId":1}' },
        { id: 2, kind: 'a', tagIds: '[3]', data: '{"tagId":3}' },
      ]);
    });

    afterAll(async () => {
      await knex.schema.dropTableIfExists('issue2667Post').dropTableIfExists('issue2667Tag');
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
      'Fetching relation "tags" of Post: the join property "issue2667Post.tagIds" of some ' +
      'owner models holds an array, which is not supported, so no related models are found ' +
      'for them. Use a ManyToManyRelation through a join table instead.';

    it('withGraphFetched() should warn once if owner join properties hold arrays', async () => {
      const posts = await Post.query().withGraphFetched('tags').orderBy('id');

      // Results are unchanged: array join properties aren't supported.
      expect(posts.map((it) => it.tags)).toEqual([[], []]);
      expect(warnings).toEqual([expectedWarning]);

      await Post.query().withGraphFetched('tags');
      expect(warnings).toEqual([expectedWarning]);
    });

    it('$fetchGraph() should warn once if owner join properties hold arrays', async () => {
      const post = await Post.query().findById(1);
      await post.$fetchGraph('tags');

      expect(post.tags).toEqual([]);
      expect(warnings).toEqual([expectedWarning]);
    });

    it('$relatedQuery() should not warn and keep returning the related models', async () => {
      const post = await Post.query().findById(1);
      const tags = await post.$relatedQuery('tags').orderBy('id');

      expect(tags.map((it) => it.id)).toEqual([1, 2]);
      expect(warnings).toEqual([]);
    });

    it('should not warn for composite keys', async () => {
      const posts = await Post.query().withGraphFetched('compositeTags').orderBy('id');

      expect(posts.map((post) => post.compositeTags.map((it) => it.id).sort())).toEqual([[1], [3]]);
      expect(warnings).toEqual([]);
    });

    if (session.isPostgres()) {
      it('should not warn for scalar JSON reference keys', async () => {
        const posts = await Post.query().withGraphFetched('jsonRefTag').orderBy('id');

        expect(posts.map((it) => it.jsonRefTag.id)).toEqual([1, 3]);
        expect(warnings).toEqual([]);
      });
    }
  });
};
