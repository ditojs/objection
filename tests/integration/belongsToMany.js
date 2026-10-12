import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('BelongsToManyRelation #2667', () => {
    const { knex } = session;
    let onBeforeUpdate = null;

    class Tag extends Model {
      static get tableName() {
        return 'belongsToManyTag';
      }

      static async beforeUpdate(args) {
        await onBeforeUpdate?.(args);
      }
    }

    class Post extends Model {
      static get tableName() {
        return 'belongsToManyPost';
      }

      static get jsonAttributes() {
        return ['tagIds', 'relatedPostIds', 'data'];
      }

      static get relationMappings() {
        return {
          tags: {
            relation: Model.BelongsToManyRelation,
            modelClass: Tag,
            join: {
              from: 'belongsToManyPost.tagIds',
              to: 'belongsToManyTag.id',
            },
          },

          relatedPosts: {
            relation: Model.BelongsToManyRelation,
            modelClass: Post,
            join: {
              from: 'belongsToManyPost.relatedPostIds',
              to: 'belongsToManyPost.id',
            },
          },

          dataTags: {
            relation: Model.BelongsToManyRelation,
            modelClass: Tag,
            join: {
              from: 'belongsToManyPost.data:tagIds',
              to: 'belongsToManyTag.id',
            },
          },

          ...(session.isPostgres() && {
            arrayTags: {
              relation: Model.BelongsToManyRelation,
              modelClass: Tag,
              join: {
                from: 'belongsToManyPost.tagIdsArray',
                to: 'belongsToManyTag.id',
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
        .dropTableIfExists('belongsToManyPost')
        .dropTableIfExists('belongsToManyTag')
        .createTable('belongsToManyTag', (t) => {
          t.integer('id').primary();
          t.string('name');
        })
        .createTable('belongsToManyPost', (t) => {
          t.integer('id').primary();

          if (session.isPostgres()) {
            t.jsonb('tagIds');
            t.json('relatedPostIds');
            t.jsonb('data');
            t.specificType('tagIdsArray', 'integer[]');
          } else if (session.isMySql()) {
            t.json('tagIds');
            t.json('relatedPostIds');
            t.json('data');
          } else {
            t.text('tagIds');
            t.text('relatedPostIds');
            t.text('data');
          }
        });

      await knex('belongsToManyTag').insert([
        { id: 1, name: 'c' },
        { id: 2, name: 'b' },
        { id: 3, name: 'a' },
        { id: 4, name: 'd' },
      ]);

      await knex('belongsToManyPost').insert(
        [
          { id: 1, tagIds: [3, 1], relatedPostIds: [2, 3] },
          { id: 2, tagIds: [1, 2, 4], relatedPostIds: [1] },
          { id: 3, tagIds: [], relatedPostIds: null },
          { id: 4, tagIds: null, relatedPostIds: [] },
          { id: 5, tagIds: [9], relatedPostIds: [] },
        ].map((post) => ({
          ...post,
          tagIds: post.tagIds && JSON.stringify(post.tagIds),
          relatedPostIds: post.relatedPostIds && JSON.stringify(post.relatedPostIds),
          // Documents without the keys and no document at all hold no keys:
          data: post.tagIds && JSON.stringify(post.tagIds.length ? { tagIds: post.tagIds } : {}),
          ...(session.isPostgres() && { tagIdsArray: post.tagIds }),
        })),
      );
    });

    afterAll(async () => {
      await knex.schema
        .dropTableIfExists('belongsToManyPost')
        .dropTableIfExists('belongsToManyTag');
    });

    function tagIds(posts, relation = 'tags') {
      return posts.map((post) => post[relation].map((tag) => tag.id).sort());
    }

    const allTagIds = [[1, 3], [1, 2, 4], [], [], []];

    it('withGraphFetched() should fetch the related models of each owner', async () => {
      const posts = await Post.query().withGraphFetched('tags').orderBy('id');

      expect(tagIds(posts)).toEqual(allTagIds);
    });

    it('withGraphFetched() should keep the order of the query', async () => {
      const posts = await Post.query()
        .withGraphFetched('tags(byName)')
        .modifiers({ byName: (query) => query.orderBy('name') })
        .orderBy('id');

      expect(posts.map((post) => post.tags.map((tag) => tag.name))).toEqual([
        ['a', 'c'],
        ['b', 'c', 'd'],
        [],
        [],
        [],
      ]);
    });

    it('withGraphFetched() should fetch nested relations of the same model class', async () => {
      const posts = await Post.query()
        .withGraphFetched('relatedPosts.[tags, relatedPosts]')
        .whereIn('id', [1, 2])
        .orderBy('id');

      expect(posts[0].relatedPosts.map((post) => post.id).sort()).toEqual([2, 3]);
      expect(tagIds(posts[0].relatedPosts.sort((a, b) => a.id - b.id))).toEqual([[1, 2, 4], []]);
      expect(posts[1].relatedPosts[0].relatedPosts.map((post) => post.id).sort()).toEqual([2, 3]);
    });

    it('withGraphFetched() should omit the implicitly selected keys', async () => {
      const posts = await Post.query().select('id').withGraphFetched('tags').findById(1);

      expect(posts.tagIds).toBeUndefined();
      expect(posts.tags.map((tag) => tag.id).sort()).toEqual([1, 3]);
    });

    it('withGraphFetched() should throw for limit() for each owner', async () => {
      await expect(
        Post.query()
          .withGraphFetched('tags(first)')
          .modifiers({ first: (query) => query.limit(1) }),
      ).rejects.toThrow(
        'Post.relationMappings.tags: limit(), offset() and first() are not supported for ' +
          'each owner. Pass `limitPerParent: false` to the graph options to limit all owners ' +
          'together.',
      );
    });

    it('withGraphFetched() should limit all owners together with limitPerParent: false', async () => {
      const posts = await Post.query()
        .withGraphFetched('tags(first)', { limitPerParent: false })
        .modifiers({ first: (query) => query.orderBy('id').limit(1) })
        .orderBy('id');

      expect(tagIds(posts)).toEqual([[1], [1], [], [], []]);
    });

    it('$fetchGraph() should fetch the related models of owners built in memory', async () => {
      const posts = [Post.fromJson({ tagIds: [2, 4] }), Post.fromJson({ tagIds: [4, 4] })];

      await Post.fetchGraph(posts, 'tags');

      expect(tagIds(posts)).toEqual([[2, 4], [4]]);
    });

    it('$fetchGraph() should fetch more keys than the databases take parameters', async () => {
      const post = Post.fromJson({ tagIds: Array.from({ length: 33000 }, (_, i) => i + 4) });

      await post.$fetchGraph('tags');

      expect(post.tags.map((tag) => tag.id)).toEqual([4]);
    });

    it('$relatedQuery() should keep the result shape of queries for empty arrays', async () => {
      const post = await Post.query().findById(3);

      expect(await post.$relatedQuery('tags').patch({ name: 'x' })).toBe(0);
      expect(await post.$relatedQuery('tags').resultSize()).toBe(0);
    });

    // SQL Server doesn't support JSON field expressions:
    if (!session.isMsSql()) {
      it('relatedQuery() should find the related models of JSON field expressions', async () => {
        const posts = await Post.query().withGraphFetched('dataTags').orderBy('id');

        expect(tagIds(posts, 'dataTags')).toEqual(allTagIds);
        expect(
          (await Post.relatedQuery('dataTags').for([2]).orderBy('id')).map((tag) => tag.id),
        ).toEqual([1, 2, 4]);
        expect(
          (await Post.relatedQuery('dataTags').for(Post.query().where('id', 1)).orderBy('id')).map(
            (tag) => tag.id,
          ),
        ).toEqual([1, 3]);
      });
    }

    it('$fetchGraph() should throw for keys that are no arrays', async () => {
      const post = Post.fromJson({ id: 1 });
      post.tagIds = '[1]';

      await expect(post.$fetchGraph('tags')).rejects.toThrow(
        'Post.relationMappings.tags: the join property "belongsToManyPost.tagIds" must hold an ' +
          'array of keys, not "[1]". Add it to the jsonAttributes of Post if it holds a JSON array.',
      );
    });

    it('$relatedQuery() should find the related models', async () => {
      const post = await Post.query().findById(2);
      const tags = await post.$relatedQuery('tags').orderBy('id');

      expect(tags.map((tag) => tag.id)).toEqual([1, 2, 4]);
      expect(post.tags).toBeUndefined();
    });

    it('$relatedQuery() should find nothing for empty arrays', async () => {
      const post = await Post.query().findById(3);

      expect(await post.$relatedQuery('tags')).toEqual([]);
    });

    it('relatedQuery() should find the related models of owner ids', async () => {
      const tags = await Post.relatedQuery('tags').for([1, 2]).orderBy('id');

      expect(tags.map((tag) => tag.id)).toEqual([1, 2, 3, 4]);
    });

    it('relatedQuery() should find the related models of an owner query', async () => {
      const tags = await Post.relatedQuery('tags')
        .for(Post.query().orderBy('id').limit(1))
        .orderBy('id');

      expect(tags.map((tag) => tag.id)).toEqual([1, 3]);
    });

    it('relatedQuery() should work as a subquery', async () => {
      const posts = await Post.query()
        .select('id', Post.relatedQuery('tags').count().as('tagCount'))
        .whereExists(Post.relatedQuery('tags').where('name', 'd'))
        .orWhere('id', 1)
        .orderBy('id');

      expect(posts.map((post) => [post.id, Number(post.tagCount)])).toEqual([
        [1, 2],
        [2, 3],
      ]);
    });

    it('withGraphJoined() should fetch the related models of each owner', async () => {
      const posts = await Post.query().withGraphJoined('tags').orderBy('id');

      expect(tagIds(posts)).toEqual(allTagIds);
    });

    it('withGraphJoined() should fetch nested relations of the same model class', async () => {
      const posts = await Post.query()
        .withGraphJoined('relatedPosts.tags')
        .whereIn('belongsToManyPost.id', [1, 2])
        .orderBy('belongsToManyPost.id')
        .orderBy('relatedPosts.id');

      expect(posts.map((post) => post.relatedPosts.map((it) => it.id))).toEqual([[2, 3], [1]]);
      expect(tagIds(posts[0].relatedPosts)).toEqual([[1, 2, 4], []]);
    });

    it('joinRelated() should join the related rows', async () => {
      const posts = await Post.query()
        .select('belongsToManyPost.id')
        .joinRelated('tags')
        .where('tags.name', 'c')
        .orderBy('belongsToManyPost.id');

      expect(posts.map((post) => post.id)).toEqual([1, 2]);
    });

    it('modifyJoin() should modify the join', async () => {
      const posts = await Post.query()
        .select('belongsToManyPost.id', 'tags.id as tagId')
        .joinRelated('tags')
        .modifyJoin('tags', (join, { related }) => {
          join.andOnVal(`${related}.name`, '<', 'c');
        })
        .orderBy('belongsToManyPost.id')
        .orderBy('tags.id');

      expect(posts.map((post) => [post.id, post.tagId])).toEqual([
        [1, 3],
        [2, 2],
      ]);
    });

    it('patch() should patch the related rows', async () => {
      const post = Post.fromJson({ tagIds: [3] });

      expect(await post.$relatedQuery('tags').patch({ name: 'e' })).toBe(1);
      expect((await Tag.query().findById(3)).name).toBe('e');

      await Tag.query().findById(3).patch({ name: 'a' });
    });

    it('patch() should find the related rows in asFindQuery() of the static hooks', async () => {
      const post = await Post.query().findById(2);
      let found = null;

      onBeforeUpdate = async ({ asFindQuery }) => {
        found = await asFindQuery().select('id').orderBy('id');
      };

      try {
        await post.$relatedQuery('tags').patch({ name: 'x' }).where('id', '>', 1);
      } finally {
        onBeforeUpdate = null;
      }

      expect(found.map((tag) => tag.id)).toEqual([2, 4]);

      await knex('belongsToManyTag').update({ name: 'b' }).where('id', 2);
      await knex('belongsToManyTag').update({ name: 'd' }).where('id', 4);
    });

    for (const [method, ...args] of [
      ['insert', { id: 5 }],
      ['relate', 1],
      ['unrelate'],
      ['delete'],
    ]) {
      it(`${method}() should throw`, async () => {
        const post = Post.fromJson({ tagIds: [] });

        await expect(post.$relatedQuery('tags')[method](...args)).rejects.toThrow(
          `Post.relationMappings.tags: ${method}() is not supported yet.`,
        );
      });
    }

    it('insertGraph() and upsertGraph() should throw', async () => {
      await expect(Post.query().insertGraph({ id: 6, tags: [] })).rejects.toThrow(
        'Post.relationMappings.tags: insertGraph() and upsertGraph() are not supported yet.',
      );
      await expect(Post.query().upsertGraph({ id: 1, relatedPosts: [] })).rejects.toThrow(
        'Post.relationMappings.relatedPosts: insertGraph() and upsertGraph() are not supported yet.',
      );
    });

    it('should throw for composite keys', () => {
      class CompositePost extends Post {
        static get relationMappings() {
          return {
            tags: {
              relation: Model.BelongsToManyRelation,
              modelClass: Tag,
              join: {
                from: ['belongsToManyPost.id', 'belongsToManyPost.tagIds'],
                to: ['belongsToManyTag.id', 'belongsToManyTag.name'],
              },
            },
          };
        }
      }

      expect(() => CompositePost.getRelations()).toThrow(
        'CompositePost.relationMappings.tags: composite keys are not supported.',
      );
    });

    if (session.isPostgres()) {
      describe('native arrays', () => {
        it('withGraphFetched()', async () => {
          const posts = await Post.query().withGraphFetched('arrayTags').orderBy('id');

          expect(tagIds(posts, 'arrayTags')).toEqual(allTagIds);
        });

        it('withGraphJoined()', async () => {
          const posts = await Post.query().withGraphJoined('arrayTags').orderBy('id');

          expect(tagIds(posts, 'arrayTags')).toEqual(allTagIds);
        });

        it('relatedQuery()', async () => {
          const tags = await Post.relatedQuery('arrayTags').for(1).orderBy('id');

          expect(tags.map((tag) => tag.id)).toEqual([1, 3]);
        });
      });
    }
  });
};
