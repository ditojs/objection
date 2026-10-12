const { expect } = require('chai');
const { Model, ValidationError, raw } = require('../../../');

module.exports = (session) => {
  const { knex } = session;

  describe('query properties of model instances #202', () => {
    class Post extends Model {
      static tableName = 'Post';

      static jsonSchema = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          views: { type: 'integer', default: 0 },
          data: { type: 'object' },
        },
      };
    }

    let TestPost;

    before(() => {
      return knex.schema.dropTableIfExists('Post').createTable('Post', (table) => {
        // SQL Server can't update identity columns, and the tests patch whole instances:
        table.integer('id').primary();
        table.string('name');
        table.integer('views');

        if (session.isPostgres()) {
          table.jsonb('data');
        }
      });
    });

    after(() => {
      return knex.schema.dropTableIfExists('Post');
    });

    beforeEach(async () => {
      TestPost = Post.bindKnex(knex);
      await TestPost.query().delete();
    });

    const fetchViews = async (id) => (await TestPost.query().findById(id)).views;

    it('should write a value assigned after a write with a query property', async () => {
      const { id } = await TestPost.query().insert({ id: 1, name: 'a', views: 0 });
      const post = await TestPost.query().patchAndFetchById(id, { views: raw('views + 1') });
      expect(post.views).to.equal(1);
      post.views = 100;
      await post.$query().patch();
      expect(await fetchViews(id)).to.equal(100);
    });

    if (session.isPostgres()) {
      it('should write a json column assigned after a write with a field expression', async () => {
        const { id } = await TestPost.query().insert({ id: 1, name: 'a', data: { a: 1 } });
        const post = await TestPost.query().patchAndFetchById(id, { 'data:a': raw('2') });
        expect(post.data).to.eql({ a: 2 });
        post.data = { a: 3 };
        await post.$query().patch();
        expect((await TestPost.query().findById(id)).data).to.eql({ a: 3 });
      });

      const expectJsonColumnError = async (promise) => {
        let error;

        try {
          await promise;
        } catch (err) {
          error = err;
        }

        expect(error).to.be.an.instanceOf(ValidationError);
        expect(error.message).to.equal(
          "data:b: can't be combined with a value for the json column 'data'",
        );
      };

      it('should fail to write a field expression given together with a value for its json column', async () => {
        await TestPost.query().insert({ id: 1, name: 'a', data: { a: 1 } });
        const post = TestPost.fromJson({ id: 1, data: { a: 2 }, 'data:b': raw('2') });
        await expectJsonColumnError(TestPost.query().patch(post).where('id', 1));
        expect((await TestPost.query().findById(1)).data).to.eql({ a: 1 });
      });

      it('should fail to write a field expression given to an instance with a value for its json column', async () => {
        await TestPost.query().insert({ id: 1, name: 'a', data: { a: 1 } });
        const post = await TestPost.query().findById(1);
        post.$setJson({ 'data:b': raw('2') });
        await expectJsonColumnError(post.$query().patch());
        expect((await TestPost.query().findById(1)).data).to.eql({ a: 1 });
      });
    }

    it('should write a value set with $setJson() after a write with a query property', async () => {
      const { id } = await TestPost.query().insert({ id: 1, name: 'a', views: 0 });
      const post = await TestPost.query().patchAndFetchById(id, { views: raw('views + 1') });
      post.$setJson({ views: 200 });
      await post.$query().patch();
      expect(await fetchViews(id)).to.equal(200);
    });

    it('should not run the query property again in a later write', async () => {
      const { id } = await TestPost.query().insert({ id: 1, name: 'a', views: 0 });
      const post = await TestPost.query().patchAndFetchById(id, { views: raw('views + 1') });
      post.name = 'b';
      await post.$query().patch();
      expect(await fetchViews(id)).to.equal(1);
    });

    it('should write a value assigned to an inserted instance', async () => {
      const post = await TestPost.query().insert({ id: 1, name: 'a', views: raw('10') });
      post.views = 1;
      await TestPost.query().patch(post).where('id', post.id);
      expect(await fetchViews(post.id)).to.equal(1);
    });

    it('should write a value assigned to a clone', async () => {
      const post = TestPost.fromJson({ id: 1, name: 'a', views: raw('10') });
      const clone = post.$clone();
      clone.views = 3;
      const { id } = await TestPost.query().insert(clone);
      expect(await fetchViews(id)).to.equal(3);
    });

    it('should keep the query properties of an unchanged clone', async () => {
      const clone = TestPost.fromJson({ id: 1, name: 'a', views: raw('10') }).$clone();
      const { id } = await TestPost.query().insert(clone);
      expect(await fetchViews(id)).to.equal(10);
    });

    it('should write a query property instead of the schema default', async () => {
      const { id } = await TestPost.query().insert({ id: 1, name: 'a', views: raw('10') });
      expect(await fetchViews(id)).to.equal(10);
    });

    it('should not set the schema default on the model for a query property', () => {
      const post = TestPost.fromJson({ id: 1, name: 'a', views: raw('10') });
      expect(post.views).to.equal(undefined);
      expect(post.toJSON()).to.eql({ id: 1, name: 'a' });
    });

    it('should write a query property set with $setJson() over a value', async () => {
      const post = TestPost.fromJson({ id: 1, name: 'a', views: 5 });
      post.$setJson({ views: raw('10') });
      const { id } = await TestPost.query().insert(post);
      expect(await fetchViews(id)).to.equal(10);
    });

    it('should keep the query properties of earlier $setJson() calls', async () => {
      const post = TestPost.fromJson({ id: 1, views: raw('10') });
      post.$setJson({ name: raw('?', ['a']) });
      const { id } = await TestPost.query().insert(post);
      expect(await TestPost.query().findById(id)).to.containSubset({ name: 'a', views: 10 });
    });

    it('should write a query property instead of the schema default in upsertGraph()', async () => {
      const { id } = await TestPost.query().insert({ id: 1, name: 'a', views: 5 });
      await TestPost.query().upsertGraph(
        { id, name: 'b', views: raw('views + 1') },
        { update: true },
      );
      expect(await fetchViews(id)).to.equal(6);
    });

    it('should write query properties over values set in hooks', async () => {
      class HookPost extends TestPost {
        $beforeInsert() {
          this.views ??= 0;
        }
      }

      const { id } = await HookPost.query().insert({ id: 1, name: 'a', views: raw('10') });
      expect(await fetchViews(id)).to.equal(10);
    });

    it('should run the query properties each time the same builder runs', async () => {
      const { id } = await TestPost.query().insert({ id: 1, name: 'a', views: 0 });
      const builder = TestPost.query()
        .patch({ views: raw('views + 1') })
        .findById(id);
      await builder;
      await builder.clone();
      expect(await fetchViews(id)).to.equal(2);
    });
  });
};
