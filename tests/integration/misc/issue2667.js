import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model, ref } from 'objection';

export default (session) => {
  describe('throw when a relation owner join property holds an array #2667', () => {
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

          manyTags: {
            relation: Model.ManyToManyRelation,
            modelClass: Tag,
            join: {
              from: 'issue2667Post.tagIds',
              through: {
                from: 'issue2667PostTag.postId',
                to: 'issue2667PostTag.tagId',
              },
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

    beforeAll(async () => {
      Tag.knex(knex);
      Post.knex(knex);

      await knex.schema
        .dropTableIfExists('issue2667PostTag')
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
          t.json('tagIds');

          if (session.isPostgres()) {
            t.jsonb('data');
          } else {
            t.json('data');
          }
        })
        .createTable('issue2667PostTag', (t) => {
          t.integer('postId');
          t.integer('tagId');
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
      await knex.schema
        .dropTableIfExists('issue2667PostTag')
        .dropTableIfExists('issue2667Post')
        .dropTableIfExists('issue2667Tag');
    });

    const arrayError =
      'Unable to fetch relation "tags" of Post: the join property "issue2667Post.tagIds" of some ' +
      'owner models holds an array, which is not supported. Use a ManyToManyRelation through a ' +
      'join table instead.';

    it('withGraphFetched() should throw if owner join properties hold arrays', async () => {
      await expect(Post.query().withGraphFetched('tags')).rejects.toThrow(arrayError);
    });

    it('should throw for many-to-many relations', async () => {
      await expect(Post.query().withGraphFetched('manyTags')).rejects.toThrow(
        'Unable to fetch relation "manyTags" of Post: the join property "issue2667Post.tagIds" ' +
          'of some owner models holds an array, which is not supported. Map the relation from a ' +
          'column that holds a single key instead.',
      );
    });

    it('$fetchGraph() should throw if owner join properties hold arrays', async () => {
      const post = await Post.query().findById(1);

      await expect(post.$fetchGraph('tags')).rejects.toThrow(arrayError);
    });

    it('should throw for owners built in memory', async () => {
      const post = Post.fromJson({ id: 1, tagIds: [1, 2] });

      await expect(post.$fetchGraph('tags')).rejects.toThrow(arrayError);
    });

    it('$relatedQuery() should not throw and keep returning the related models', async () => {
      const post = await Post.query().findById(1);
      const tags = await post.$relatedQuery('tags').orderBy('id');

      expect(tags.map((it) => it.id)).toEqual([1, 2]);
    });

    it('should not throw for composite keys', async () => {
      const posts = await Post.query().withGraphFetched('compositeTags').orderBy('id');

      expect(posts.map((post) => post.compositeTags.map((it) => it.id).sort())).toEqual([[1], [3]]);
    });

    if (session.isPostgres()) {
      it('should not throw for scalar JSON reference keys', async () => {
        const posts = await Post.query().withGraphFetched('jsonRefTag').orderBy('id');

        expect(posts.map((it) => it.jsonRefTag.id)).toEqual([1, 3]);
      });
    }
  });
};
