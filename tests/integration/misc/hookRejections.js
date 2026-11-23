import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  // When the hook of one model rejects asynchronously and the hook of a later
  // model throws synchronously, the query rejects with the second error, and
  // the first one must not be left unhandled (#566).
  describe('hooks that reject and throw for different models', () => {
    let failingHook = null;
    let unhandledErrors = [];

    const fail = (hook, model) => {
      if (hook === failingHook) {
        if (model.model1Prop1 === 'async') {
          return Promise.reject(new Error('async'));
        } else if (model.model1Prop1 === 'sync') {
          throw new Error('sync');
        }
      }
    };

    class Item extends Model {
      static tableName = 'Model1';

      static get relationMappings() {
        return {
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Item,
            join: { from: 'Model1.model1Id', to: 'Model1.id' },
          },
          child: {
            relation: Model.HasOneRelation,
            modelClass: Item,
            join: { from: 'Model1.id', to: 'Model1.model1Id' },
          },
          children: {
            relation: Model.HasManyRelation,
            modelClass: Item,
            join: { from: 'Model1.id', to: 'Model1.model1Id' },
            beforeInsert: (model) => fail('relationBeforeInsert', model),
          },
        };
      }

      $beforeInsert() {
        return fail('beforeInsert', this);
      }

      $afterFind() {
        return fail('afterFind', this);
      }
    }

    const onUnhandledRejection = (err) => unhandledErrors.push(err);

    beforeAll(() => {
      Item.knex(session.knex);
      process.on('unhandledRejection', onUnhandledRejection);
    });

    afterAll(() => {
      process.off('unhandledRejection', onUnhandledRejection);
    });

    beforeEach(async () => {
      failingHook = null;
      unhandledErrors = [];

      await session.populate([
        {
          id: 1,
          model1Prop1: 'root',
          model1Relation1: { id: 2, model1Prop1: 'async' },
          model1Relation1Inverse: { id: 3, model1Prop1: 'sync' },
        },
      ]);
    });

    const expectRejection = async (hook, query) => {
      failingHook = hook;
      await expect(query()).rejects.toThrow('sync');
      // Unhandled rejections are only reported after a tick:
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandledErrors).toEqual([]);
    };

    it('$beforeInsert()', async () => {
      await expectRejection('beforeInsert', () =>
        Item.query().insert([{ model1Prop1: 'async' }, { model1Prop1: 'sync' }]),
      );
    });

    it('$afterFind()', async () => {
      await expectRejection('afterFind', () => Item.query().whereIn('id', [2, 3]).orderBy('id'));
    });

    it('$afterFind() of joined relations', async () => {
      await expectRejection('afterFind', () =>
        Item.query().findById(1).withGraphJoined('[parent, child]'),
      );
    });

    it('traverseAsync()', async () => {
      const models = [
        Item.fromJson({ model1Prop1: 'async' }),
        Item.fromJson({ model1Prop1: 'sync' }),
      ];
      await expectRejection('traverser', () =>
        Item.traverseAsync(models, (model) => fail('traverser', model)),
      );
    });

    it('beforeInsert() of relations in insertGraph()', async () => {
      await expectRejection('relationBeforeInsert', () =>
        Item.query().insertGraph({
          model1Prop1: 'root',
          children: [{ model1Prop1: 'async' }, { model1Prop1: 'sync' }],
        }),
      );
    });
  });
};
