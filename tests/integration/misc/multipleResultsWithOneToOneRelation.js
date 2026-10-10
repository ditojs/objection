import { describe, it, expect, beforeEach } from 'vitest';

export default (session) => {
  describe('multiple results with a one-to-one relation', () => {
    beforeEach(() => {
      // This tests insertGraph.
      return session.populate([
        {
          id: 1,
          model1Prop1: 'hello 1',

          model1Relation1: {
            id: 2,
            model1Prop1: 'hello 2',
          },
        },
        {
          id: 3,
          model1Prop1: 'hello 1',

          model1Relation1: {
            id: 4,
            model1Prop1: 'hello 2',
          },
        },
      ]);
    });

    it('belongs to one relation', () => {
      return session.models.Model1.query()
        .whereIn('id', [1, 3])
        .withGraphFetched('model1Relation1')
        .then((models) => {
          expect(models).toEqual([
            {
              id: 1,
              model1Id: 2,
              model1Prop1: 'hello 1',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 2,
                model1Id: null,
                model1Prop1: 'hello 2',
                model1Prop2: null,
                $afterFindCalled: 1,
              },
            },
            {
              id: 3,
              model1Id: 4,
              model1Prop1: 'hello 1',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 4,
                model1Id: null,
                model1Prop1: 'hello 2',
                model1Prop2: null,
                $afterFindCalled: 1,
              },
            },
          ]);
        });
    });

    it('has one relation', () => {
      return session.models.Model1.query()
        .whereIn('id', [2, 4])
        .withGraphFetched('model1Relation1Inverse')
        .then((models) => {
          expect(models).toEqual([
            {
              id: 2,
              model1Id: null,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1Inverse: {
                id: 1,
                model1Id: 2,
                model1Prop1: 'hello 1',
                model1Prop2: null,
                $afterFindCalled: 1,
              },
            },
            {
              id: 4,
              model1Id: null,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1Inverse: {
                id: 3,
                model1Id: 4,
                model1Prop1: 'hello 1',
                model1Prop2: null,
                $afterFindCalled: 1,
              },
            },
          ]);
        });
    });
  });
};
