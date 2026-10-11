import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

export default (session) => {
  describe('relation queries keep the foreign keys of the models they assign #2001', () => {
    let Model1;

    beforeAll(() => {
      Model1 = class extends session.unboundModels.Model1 {
        static get relatedFindQueryMutates() {
          return true;
        }

        static get relatedInsertQueryMutates() {
          return true;
        }
      }.bindKnex(session.knex);
    });

    beforeEach(() => {
      return session.populate([
        {
          id: 1,
          model1Prop1: 'parent',

          model1Relation1Inverse: {
            id: 2,
            model1Prop1: 'child',
          },

          model1Relation2: [
            {
              idCol: 1,
              model2Prop1: 'has many',
            },
          ],
        },
      ]);
    });

    it('withGraphFetched() assigning empty relations', async () => {
      const models = await Model1.query()
        .withGraphFetched('[model1Relation1, model1Relation1Inverse, model1Relation2]')
        .modifyGraph('[model1Relation1, model1Relation1Inverse, model1Relation2]', (builder) =>
          builder.whereRaw('1 = 0'),
        )
        .orderBy('id');

      expect(models.map((it) => it.model1Id)).toEqual([null, 1]);
      expect(models[1].model1Relation1).toBeNull();
    });

    it('withGraphJoined() assigning empty relations', async () => {
      const models = await Model1.query()
        .withGraphJoined('model1Relation1')
        .modifyGraph('model1Relation1', (builder) => builder.whereRaw('1 = 0'))
        .orderBy('Model1.id');

      expect(models.map((it) => it.model1Id)).toEqual([null, 1]);
      expect(models[1].model1Relation1).toBeNull();
    });

    it('$relatedQuery() assigning an empty relation', async () => {
      const child = await Model1.query().findById(2);
      await child.$relatedQuery('model1Relation1').whereRaw('1 = 0');

      expect(child.model1Relation1).toBeNull();
      expect(child.model1Id).toBe(1);
    });

    it('$relatedQuery().insert() replacing the model of a HasOneRelation', async () => {
      const parent = await Model1.query().findById(1).withGraphFetched('model1Relation1Inverse');
      const child = parent.model1Relation1Inverse;
      const inserted = await parent
        .$relatedQuery('model1Relation1Inverse')
        .insert({ model1Prop1: 'new child' });

      // Both rows still point to the parent in the database:
      expect(parent.model1Relation1Inverse).toBe(inserted);
      expect(inserted.model1Id).toBe(1);
      expect(child.model1Id).toBe(1);
    });
  });
};
