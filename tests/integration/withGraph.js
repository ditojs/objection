import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ValidationError, raw, ref } from 'objection';
import mockKnexFactory from '../../testUtils/mockKnex.js';
import { map as promiseMap } from '../../lib/utils/promiseUtils/index.js';
import { pick, range, sortBy } from '../../testUtils/testUtils.js';
import Knex from 'knex';

export default (session) => {
  const Model1 = session.models.Model1;
  const Model2 = session.models.Model2;

  describe('Model withGraph queries', () => {
    beforeEach(() => {
      return session.populate([
        {
          id: 1,
          model1Prop1: 'hello 1',

          model1Relation1: {
            id: 2,
            model1Prop1: 'hello 2',

            model1Relation1: {
              id: 3,
              model1Prop1: 'hello 3',

              model1Relation1: {
                id: 4,
                model1Prop1: 'hello 4',
                model1Relation2: [
                  {
                    idCol: 4,
                    model2Prop1: 'hejsan 4',
                  },
                ],
              },
            },
          },

          model1Relation2: [
            {
              idCol: 1,
              model2Prop1: 'hejsan 1',

              model2Relation2: {
                id: 8,
                model1Prop1: 'hello 8',

                model1Relation1: {
                  id: 9,
                  model1Prop1: 'hello 9',
                },
              },
            },
            {
              idCol: 2,
              model2Prop1: 'hejsan 2',

              model2Relation1: [
                {
                  id: 5,
                  model1Prop1: 'hello 5',
                  aliasedExtra: 'extra 5',
                },
                {
                  id: 6,
                  model1Prop1: 'hello 6',
                  aliasedExtra: 'extra 6',

                  model1Relation1: {
                    id: 7,
                    model1Prop1: 'hello 7',
                  },

                  model1Relation2: [
                    {
                      idCol: 3,
                      model2Prop1: 'hejsan 3',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);
    });

    test('model1Relation1', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          },
        },
      ]);

      expect(models[0]).toBeInstanceOf(Model1);
      expect(models[0].model1Relation1).toBeInstanceOf(Model1);
    });

    test({ model1Relation1: true }, (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          },
        },
      ]);

      expect(models[0]).toBeInstanceOf(Model1);
      expect(models[0].model1Relation1).toBeInstanceOf(Model1);
    });

    test('model1Relation1(select:model1Prop1)', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            model1Prop1: 'hello 2',
            $afterFindCalled: 1,
          },
        },
      ]);

      expect(models[0]).toBeInstanceOf(Model1);
      expect(models[0].model1Relation1).toBeInstanceOf(Model1);
    });

    test(
      {
        model1Relation1: {
          $modify: ['select:model1Prop1'],
        },
      },
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              model1Prop1: 'hello 2',
              $afterFindCalled: 1,
            },
          },
        ]);

        expect(models[0]).toBeInstanceOf(Model1);
        expect(models[0].model1Relation1).toBeInstanceOf(Model1);
      },
    );

    test('model1Relation1.model1Relation1', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 3,
              model1Id: 4,
              model1Prop1: 'hello 3',
              model1Prop2: null,
              $afterFindCalled: 1,
            },
          },
        },
      ]);
    });

    test({ model1Relation1: { model1Relation1: {} } }, (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 3,
              model1Id: 4,
              model1Prop1: 'hello 3',
              model1Prop2: null,
              $afterFindCalled: 1,
            },
          },
        },
      ]);
    });

    test('model1Relation1.model1Relation1Inverse', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
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
        },
      ]);
    });

    test(
      'model1Relation1.^',
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 2,
              model1Id: 3,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 3,
                model1Id: 4,
                model1Prop1: 'hello 3',
                model1Prop2: null,
                $afterFindCalled: 1,
                model1Relation1: {
                  id: 4,
                  model1Id: null,
                  model1Prop1: 'hello 4',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                  model1Relation1: null,
                },
              },
            },
          },
        ]);
      },
      { disableJoin: true },
    );

    test('model1Relation1.^2', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 3,
              model1Id: 4,
              model1Prop1: 'hello 3',
              model1Prop2: null,
              $afterFindCalled: 1,
            },
          },
        },
      ]);
    });

    test(
      {
        aliased1: {
          $relation: 'model1Relation1',
          $recursive: 2,
        },
      },
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,

            aliased1: {
              id: 2,
              model1Id: 3,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              aliased1: {
                id: 3,
                model1Id: 4,
                model1Prop1: 'hello 3',
                model1Prop2: null,
                $afterFindCalled: 1,
              },
            },
          },
        ]);
      },
    );

    test(
      'model1Relation1(selectId).^',
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 2,
              model1Id: 3,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 3,
                model1Id: 4,
                $afterFindCalled: 1,
                model1Relation1: {
                  id: 4,
                  $afterFindCalled: 1,
                  model1Id: null,
                  model1Relation1: null,
                },
              },
            },
          },
        ]);
      },
      {
        filters: {
          selectId: (builder) => {
            builder.select('id', 'model1Id');
          },
        },
        disableJoin: true,
      },
    );

    test(
      'model1Relation1(selectId).^4',
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              model1Prop1: 'hello 2',
              $afterFindCalled: 1,
              model1Relation1: {
                model1Prop1: 'hello 3',
                $afterFindCalled: 1,
                model1Relation1: {
                  model1Prop1: 'hello 4',
                  $afterFindCalled: 1,
                  model1Relation1: null,
                },
              },
            },
          },
        ]);
      },
      {
        filters: {
          selectId: (builder) => {
            builder.select('model1Prop1');
          },
        },
        disableWhereIn: true,
        eagerOptions: { minimize: true },
      },
    );

    test('model1Relation2.model2Relation2', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,

          model1Relation2: [
            {
              idCol: 1,
              model1Id: 1,
              model2Prop1: 'hejsan 1',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation2: {
                id: 8,
                model1Id: 9,
                model1Prop1: 'hello 8',
                model1Prop2: null,
                $afterFindCalled: 1,
              },
            },
            {
              idCol: 2,
              model1Id: 1,
              model2Prop1: 'hejsan 2',
              model2Prop2: null,
              $afterFindCalled: 1,
              model2Relation2: null,
            },
          ],
        },
      ]);

      expect(models[0]).toBeInstanceOf(Model1);
      expect(models[0].model1Relation2[0].model2Relation2).toBeInstanceOf(Model1);
    });

    test('model1Relation2.model2Relation2.model1Relation1', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,

          model1Relation2: [
            {
              idCol: 1,
              model1Id: 1,
              model2Prop1: 'hejsan 1',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation2: {
                id: 8,
                model1Id: 9,
                model1Prop1: 'hello 8',
                model1Prop2: null,
                $afterFindCalled: 1,

                model1Relation1: {
                  id: 9,
                  model1Id: null,
                  model1Prop1: 'hello 9',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                },
              },
            },
            {
              idCol: 2,
              model1Id: 1,
              model2Prop1: 'hejsan 2',
              model2Prop2: null,
              $afterFindCalled: 1,
              model2Relation2: null,
            },
          ],
        },
      ]);

      expect(models[0]).toBeInstanceOf(Model1);
      expect(models[0].model1Relation2[0].model2Relation2.model1Relation1).toBeInstanceOf(Model1);
    });

    test('[model1Relation1, model1Relation2]', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,

          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          },

          model1Relation2: [
            {
              idCol: 1,
              model1Id: 1,
              model2Prop1: 'hejsan 1',
              model2Prop2: null,
              $afterFindCalled: 1,
            },
            {
              idCol: 2,
              model1Id: 1,
              model2Prop1: 'hejsan 2',
              model2Prop2: null,
              $afterFindCalled: 1,
            },
          ],
        },
      ]);

      expect(models[0]).toBeInstanceOf(Model1);
      expect(models[0].model1Relation2[0]).toBeInstanceOf(Model2);
    });

    test(
      '[model1Relation1, model1Relation2(orderByDesc, selectProps)]',
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,

            model1Relation1: {
              id: 2,
              model1Id: 3,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
            },

            model1Relation2: [
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                $afterFindCalled: 1,
              },
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                $afterFindCalled: 1,
              },
            ],
          },
        ]);
      },
      {
        filters: {
          selectProps: (builder) => {
            builder.select('id_col', 'model1_id', 'model2_prop1');
          },
          orderByDesc: (builder) => {
            builder.orderBy('model2_prop1', 'desc');
          },
        },
        disableJoin: true,
        disableSort: true,
      },
    );

    test('[model1Relation1, model1Relation2.model2Relation1]', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,

          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          },

          model1Relation2: [
            {
              idCol: 1,
              model1Id: 1,
              model2Prop1: 'hejsan 1',
              model2Prop2: null,
              $afterFindCalled: 1,
              model2Relation1: [],
            },
            {
              idCol: 2,
              model1Id: 1,
              model2Prop1: 'hejsan 2',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: 5,
                  model1Id: null,
                  model1Prop1: 'hello 5',
                  model1Prop2: null,
                  aliasedExtra: 'extra 5',
                  $afterFindCalled: 1,
                },
                {
                  id: 6,
                  model1Id: 7,
                  model1Prop1: 'hello 6',
                  model1Prop2: null,
                  aliasedExtra: 'extra 6',
                  $afterFindCalled: 1,
                },
              ],
            },
          ],
        },
      ]);
    });

    test('[model1Relation2.model2Relation1, model1Relation1]', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,

          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          },

          model1Relation2: [
            {
              idCol: 1,
              model1Id: 1,
              model2Prop1: 'hejsan 1',
              model2Prop2: null,
              $afterFindCalled: 1,
              model2Relation1: [],
            },
            {
              idCol: 2,
              model1Id: 1,
              model2Prop1: 'hejsan 2',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: 5,
                  model1Id: null,
                  model1Prop1: 'hello 5',
                  model1Prop2: null,
                  aliasedExtra: 'extra 5',
                  $afterFindCalled: 1,
                },
                {
                  id: 6,
                  model1Id: 7,
                  model1Prop1: 'hello 6',
                  model1Prop2: null,
                  aliasedExtra: 'extra 6',
                  $afterFindCalled: 1,
                },
              ],
            },
          ],
        },
      ]);
    });

    test('[model1Relation1, model1Relation2.model2Relation1.[model1Relation1, model1Relation2]]', (models) => {
      expect(models).toEqual([
        {
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,

          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          },

          model1Relation2: [
            {
              idCol: 1,
              model1Id: 1,
              model2Prop1: 'hejsan 1',
              model2Prop2: null,
              $afterFindCalled: 1,
              model2Relation1: [],
            },
            {
              idCol: 2,
              model1Id: 1,
              model2Prop1: 'hejsan 2',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: 5,
                  model1Id: null,
                  model1Prop1: 'hello 5',
                  model1Prop2: null,
                  aliasedExtra: 'extra 5',
                  model1Relation1: null,
                  model1Relation2: [],
                  $afterFindCalled: 1,
                },
                {
                  id: 6,
                  model1Id: 7,
                  model1Prop1: 'hello 6',
                  model1Prop2: null,
                  aliasedExtra: 'extra 6',
                  $afterFindCalled: 1,

                  model1Relation1: {
                    id: 7,
                    model1Id: null,
                    model1Prop1: 'hello 7',
                    model1Prop2: null,
                    $afterFindCalled: 1,
                  },

                  model1Relation2: [
                    {
                      idCol: 3,
                      model1Id: 6,
                      model2Prop1: 'hejsan 3',
                      model2Prop2: null,
                      $afterFindCalled: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);
    });

    // This tests the Model.modifiers feature.
    test(
      `[
      model1Relation1(select:id, localModifier),
      model1Relation2.[
        model2Relation1(select:model1Prop1).[
          model1Relation1(select:id, select:model1Prop1, select:model1Prop1Aliased),
          model1Relation2
        ]
      ]
    ]`,
      (models) => {
        expect(models).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,

            model1Relation1: {
              id: 2,
              model1Prop2: null,
              $afterFindCalled: 1,
            },

            model1Relation2: [
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                model2Prop2: null,
                $afterFindCalled: 1,
                model2Relation1: [],
              },
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                model2Prop2: null,
                $afterFindCalled: 1,

                model2Relation1: [
                  {
                    model1Prop1: 'hello 5',
                    $afterFindCalled: 1,

                    model1Relation1: null,
                    model1Relation2: [],
                  },
                  {
                    model1Prop1: 'hello 6',
                    $afterFindCalled: 1,

                    model1Relation1: {
                      id: 7,
                      model1Prop1: 'hello 7',
                      aliasedInFilter: 'hello 7',
                      $afterFindCalled: 1,
                    },

                    model1Relation2: [
                      {
                        idCol: 3,
                        model1Id: 6,
                        model2Prop1: 'hejsan 3',
                        model2Prop2: null,
                        $afterFindCalled: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      },
      {
        filters: {
          localModifier: (builder) => builder.select('model1Prop2'),
        },
      },
    );

    it('should fail fast on incorrect table name', () => {
      return Model1.query()
        .findById(1)
        .withGraphJoined('model1Relation111')
        .then(() => {
          throw new Error('should not get here');
        })
        .catch((err) => {
          expect(err.message).toBe('unknown relation "model1Relation111" in a relation expression');
        });
    });

    describe('limitPerParent option', () => {
      const relatedIds = (models, relation, idProp = 'idCol') =>
        models.map((model) => {
          const related = model[relation];
          return [
            model.id ?? model.idCol,
            Array.isArray(related) ? related.map((it) => it[idProp]) : related && related[idProp],
          ];
        });

      const fetchModel1s = (expr, modify, opt) =>
        Model1.query()
          .withGraphFetched(expr, opt)
          .whereExists(Model1.relatedQuery('model1Relation2'))
          .modifyGraph('model1Relation2', modify)
          .orderBy('id');

      it('should apply limit() per parent in a HasManyRelation', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').limit(1),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [2]],
          [4, [4]],
          [6, [3]],
        ]);
      });

      it('should apply limit() to all parents with limitPerParent: false', async () => {
        const models = await fetchModel1s(
          'model1Relation2',
          (query) => query.orderBy('id_col', 'desc').limit(1),
          { limitPerParent: false },
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, []],
          [4, [4]],
          [6, []],
        ]);
      });

      it('should apply offset() per parent', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').limit(1).offset(1),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [1]],
          [4, []],
          [6, []],
        ]);
      });

      it('should apply first() per parent', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').first(),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [2]],
          [4, [4]],
          [6, [3]],
        ]);
      });

      it('should apply orderByRaw() per parent', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderByRaw('case when id_col = ? then 0 else 1 end, id_col desc', [1]).limit(1),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [1]],
          [4, [4]],
          [6, [3]],
        ]);
      });

      it('should apply nulls first and last of orderBy() per parent', async () => {
        await Model2.query().findById(2).patch({ model2Prop1: null });

        const fetchFirst = (nulls) =>
          fetchModel1s('model1Relation2', (query) =>
            query.orderBy('model2_prop1', 'asc', nulls).limit(1),
          );

        expect(relatedIds(await fetchFirst('first'), 'model1Relation2')).toEqual([
          [1, [2]],
          [4, [4]],
          [6, [3]],
        ]);
        expect(relatedIds(await fetchFirst('last'), 'model1Relation2')).toEqual([
          [1, [1]],
          [4, [4]],
          [6, [3]],
        ]);
      });

      it('should apply a limit of an onBuildKnex() hook per parent', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').onBuildKnex((knexQuery) => knexQuery.limit(1)),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [2]],
          [4, [4]],
          [6, [3]],
        ]);
      });

      it('should ignore limit(null) like knex', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').limit(null),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [2, 1]],
          [4, [4]],
          [6, [3]],
        ]);
      });

      it('should keep limiting all parents with range()', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').range(0, 0).limit(2),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, []],
          [4, [4]],
          [6, [3]],
        ]);
      });

      if (session.isPostgres() || session.isMySql()) {
        it('should keep the timeout() of the relation query', async () => {
          const sleep = session.isPostgres() ? 'pg_sleep(0.3)' : 'sleep(0.3)';
          let error = null;

          try {
            await fetchModel1s('model1Relation2', (query) =>
              query.select('*', raw(sleep)).orderBy('id_col', 'desc').limit(1).timeout(50),
            );
          } catch (err) {
            error = err;
          }

          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Defined query timeout of 50ms exceeded');
        });
      }

      it('should keep the order of the related models', async () => {
        const models = await fetchModel1s('model1Relation2', (query) =>
          query.orderBy('id_col', 'desc').limit(2),
        );

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [2, 1]],
          [4, [4]],
          [6, [3]],
        ]);
        expect(models[0].model1Relation2[0]).toBeInstanceOf(Model2);
        expect(models[0].model1Relation2[0]).not.toHaveProperty('objectiontmprownum');
      });

      it('should fetch nested relations of the limited models', async () => {
        const models = await fetchModel1s('model1Relation2.model2Relation1', (query) =>
          query.orderBy('id_col', 'desc').limit(1),
        ).modifyGraph('model1Relation2.model2Relation1', (query) => query.orderBy('id'));

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, [2]],
          [4, [4]],
          [6, [3]],
        ]);
        expect(relatedIds(models[0].model1Relation2, 'model2Relation1', 'id')).toEqual([
          [2, [5, 6]],
        ]);
      });

      it('should apply limit() per parent in a ManyToManyRelation', async () => {
        await Model2.query().findById(1).patch({ model1Id: null });
        await Model2.relatedQuery('model2Relation1').for(1).relate({ id: 5, aliasedExtra: 'x' });

        const models = await Model2.query()
          .whereIn('id_col', [1, 2, 3])
          .withGraphFetched('model2Relation1')
          .modifyGraph('model2Relation1', (query) => query.orderBy('id', 'desc').limit(1))
          .orderBy('id_col');

        expect(relatedIds(models, 'model2Relation1', 'id')).toEqual([
          [1, [5]],
          [2, [6]],
          [3, []],
        ]);
        expect(models[1].model2Relation1[0].aliasedExtra).toBe('extra 6');
      });

      // SQLite can't select `schema.table.*`.
      if (!session.isSqlite()) {
        it('should apply limit() per parent with schema-qualified table names', async () => {
          // The tables are in the default schema of each database:
          const schema = session.isPostgres()
            ? 'public'
            : session.isMsSql()
              ? 'dbo'
              : session.knex.client.database();

          class SchemaModel1 extends Model1 {
            static get tableName() {
              return `${schema}.Model1`;
            }

            static get relationMappings() {
              return {
                model1Relation2: {
                  relation: Model1.HasManyRelation,
                  modelClass: SchemaModel2,
                  join: { from: `${schema}.Model1.id`, to: `${schema}.model2.model1_id` },
                },
              };
            }
          }

          class SchemaModel2 extends Model2 {
            static tableName() {
              return `${schema}.model2`;
            }

            static get relationMappings() {
              return {
                model2Relation1: {
                  relation: Model2.ManyToManyRelation,
                  modelClass: SchemaModel1,
                  join: {
                    from: `${schema}.model2.id_col`,
                    through: {
                      from: `${schema}.Model1Model2.model2Id`,
                      to: `${schema}.Model1Model2.model1Id`,
                    },
                    to: `${schema}.Model1.id`,
                  },
                },
              };
            }
          }

          // The order can refer to the table with and without its schema.
          for (const table of [`${schema}.model2`, 'model2']) {
            const model1s = await SchemaModel1.query()
              .withGraphFetched('model1Relation2', { limitPerParent: true })
              .whereExists(SchemaModel1.relatedQuery('model1Relation2'))
              .modifyGraph('model1Relation2', (query) =>
                query.orderBy(`${table}.id_col`, 'desc').limit(1),
              )
              .orderBy('id');

            expect(relatedIds(model1s, 'model1Relation2')).toEqual([
              [1, [2]],
              [4, [4]],
              [6, [3]],
            ]);
          }

          const model2s = await SchemaModel2.query()
            .whereIn('id_col', [1, 2, 3])
            .withGraphFetched('model2Relation1', { limitPerParent: true })
            .modifyGraph('model2Relation1', (query) => query.orderBy('id', 'desc').limit(1))
            .orderBy('id_col');

          expect(relatedIds(model2s, 'model2Relation1', 'id')).toEqual([
            [1, []],
            [2, [6]],
            [3, []],
          ]);
        });
      }

      it('should apply limit() of a relation mapping modify per parent', async () => {
        class Model1Latest extends Model1 {
          static get relationMappings() {
            return {
              ...super.relationMappings,
              latestModel2: {
                relation: Model1.HasOneRelation,
                modelClass: Model2,
                join: { from: 'Model1.id', to: 'model2.model1_id' },
                modify: (query) => query.orderBy('id_col', 'desc').limit(1),
              },
            };
          }
        }

        const models = await Model1Latest.query()
          .withGraphFetched('latestModel2')
          .whereExists(Model1Latest.relatedQuery('latestModel2'))
          .orderBy('id');

        expect(relatedIds(models, 'latestModel2')).toEqual([
          [1, 2],
          [4, 4],
          [6, 3],
        ]);
      });

      it('should support limitPerParent: false in defaultGraphOptions', async () => {
        class Model1Defaults extends Model1 {
          static get defaultGraphOptions() {
            return { limitPerParent: false };
          }
        }

        const models = await Model1Defaults.query()
          .withGraphFetched('model1Relation2')
          .whereExists(Model1Defaults.relatedQuery('model1Relation2'))
          .modifyGraph('model1Relation2', (query) => query.orderBy('id_col', 'desc').limit(1))
          .orderBy('id');

        expect(relatedIds(models, 'model1Relation2')).toEqual([
          [1, []],
          [4, [4]],
          [6, []],
        ]);
      });

      if (session.isMySql()) {
        describe('without window functions', () => {
          let knex;
          let queries;

          // Simulate MySQL 5.7, as knex only detects the server's version
          // if it isn't configured.
          const createModel = (ModelClass) =>
            ModelClass.bindKnex(
              mockKnexFactory(knex, function (mock, oldImpl, args) {
                queries.push(this.toSQL().sql);
                return oldImpl.apply(this, args);
              }),
            );

          beforeAll(() => {
            knex = Knex({ ...session.opt.knexConfig, version: '5.7.0' });
          });

          afterAll(() => {
            return knex.destroy();
          });

          beforeEach(() => {
            queries = [];
          });

          it('should fetch the related models of each parent separately', async () => {
            const TestModel = createModel(Model1);
            const models = await TestModel.query()
              .withGraphFetched('model1Relation2')
              .whereExists(TestModel.relatedQuery('model1Relation2'))
              .modifyGraph('model1Relation2', (query) => query.orderBy('id_col', 'desc').first())
              .orderBy('id');

            expect(relatedIds(models, 'model1Relation2')).toEqual([
              [1, [2]],
              [4, [4]],
              [6, [3]],
            ]);
            expect(queries).toHaveLength(4);
            expect(queries.join()).not.toContain('row_number');
          });

          it('should fetch the related models of each parent separately for a relation mapping modify', async () => {
            class Model1Latest extends Model1 {
              static get relationMappings() {
                return {
                  ...super.relationMappings,
                  latestModel2: {
                    relation: Model1.HasOneRelation,
                    modelClass: Model2,
                    join: { from: 'Model1.id', to: 'model2.model1_id' },
                    modify: (query) => query.orderBy('id_col', 'desc').limit(1),
                  },
                };
              }
            }

            const TestModel = createModel(Model1Latest);
            const models = await TestModel.query()
              .withGraphFetched('latestModel2')
              .whereExists(TestModel.relatedQuery('latestModel2'))
              .orderBy('id');

            expect(relatedIds(models, 'latestModel2')).toEqual([
              [1, 2],
              [4, 4],
              [6, 3],
            ]);
            expect(queries).toHaveLength(4);
          });

          it('should fetch the related models of all parents together without a limit', async () => {
            const TestModel = createModel(Model1);
            let modifyCount = 0;
            const models = await TestModel.query()
              .withGraphFetched('model1Relation2')
              .whereExists(TestModel.relatedQuery('model1Relation2'))
              .modifyGraph('model1Relation2', (query) => {
                ++modifyCount;
                query.orderBy('id_col', 'desc');
              })
              .orderBy('id');

            expect(relatedIds(models, 'model1Relation2')).toEqual([
              [1, [2, 1]],
              [4, [4]],
              [6, [3]],
            ]);
            expect(queries).toHaveLength(2);
            expect(modifyCount).toBe(1);
          });

          it('should fetch the related models of all parents together with limitPerParent: false', async () => {
            const TestModel = createModel(Model1);
            const models = await TestModel.query()
              .withGraphFetched('model1Relation2', { limitPerParent: false })
              .whereExists(TestModel.relatedQuery('model1Relation2'))
              .modifyGraph('model1Relation2', (query) => query.orderBy('id_col', 'desc').limit(1))
              .orderBy('id');

            expect(relatedIds(models, 'model1Relation2')).toEqual([
              [1, []],
              [4, [4]],
              [6, []],
            ]);
            expect(queries).toHaveLength(2);
          });
        });
      }
    });

    it('setting maxBatchSize option to 1 should cause relations to be fetched naively to each parent separately', () => {
      return Model1.query()
        .withGraphFetched('model1Relation2', { maxBatchSize: 1 })
        .whereExists(Model1.relatedQuery('model1Relation2'))
        .modifyGraph('model1Relation2', (query) => {
          // This works only because we set `maxBatchSize` to 1.
          query.limit(1).orderBy('id_col');
        })
        .orderBy('id')
        .then((result) => {
          expect(result).toEqual([
            {
              id: 1,
              model1Id: 2,
              model1Prop1: 'hello 1',
              model1Prop2: null,
              model1Relation2: [
                {
                  idCol: 1,
                  model1Id: 1,
                  model2Prop1: 'hejsan 1',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
              ],
              $afterFindCalled: 1,
            },
            {
              id: 4,
              model1Id: null,
              model1Prop1: 'hello 4',
              model1Prop2: null,
              model1Relation2: [
                {
                  idCol: 4,
                  model1Id: 4,
                  model2Prop1: 'hejsan 4',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
              ],
              $afterFindCalled: 1,
            },
            {
              id: 6,
              model1Id: 7,
              model1Prop1: 'hello 6',
              model1Prop2: null,
              model1Relation2: [
                {
                  idCol: 3,
                  model1Id: 6,
                  model2Prop1: 'hejsan 3',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
              ],
              $afterFindCalled: 1,
            },
          ]);
        });
    });

    it('should work with zero id', () => {
      return promiseMap(
        ['withGraphFetched', 'withGraphJoined'],
        (method) => {
          return session
            .populate([
              {
                id: 0,
                model1Prop1: 'hello 0',

                model1Relation1: {
                  id: 1,
                  model1Prop1: 'hello 1',
                },

                model1Relation2: [
                  {
                    idCol: 0,
                    model2Prop1: 'hejsan 1',

                    model2Relation1: [
                      {
                        id: 2,
                        model1Prop1: 'hello 2',
                      },
                    ],
                  },
                ],
              },
            ])
            .then(() => {
              return Model1.query()
                .where('Model1.id', 0)
                [method]('[model1Relation1, model1Relation2.model2Relation1]');
            })
            .then((models) => {
              expect(models).toEqual([
                {
                  id: 0,
                  model1Prop1: 'hello 0',
                  model1Prop2: null,
                  model1Id: 1,
                  $afterFindCalled: 1,

                  model1Relation1: {
                    id: 1,
                    model1Prop1: 'hello 1',
                    model1Prop2: null,
                    model1Id: null,
                    $afterFindCalled: 1,
                  },

                  model1Relation2: [
                    {
                      idCol: 0,
                      model2Prop1: 'hejsan 1',
                      model2Prop2: null,
                      model1Id: 0,
                      $afterFindCalled: 1,

                      model2Relation1: [
                        {
                          id: 2,
                          model1Prop1: 'hello 2',
                          model1Prop2: null,
                          aliasedExtra: null,
                          model1Id: null,
                          $afterFindCalled: 1,
                        },
                      ],
                    },
                  ],
                },
              ]);
            });
        },
        { concurrency: 1 },
      );
    });

    it('keepImplicitJoinProps', () => {
      return Model1.query()
        .select('id')
        .findById(1)
        .withGraphFetched('[model1Relation1, model1Relation2.model2Relation1]')
        .internalOptions({ keepImplicitJoinProps: true })
        .modifyGraph('model1Relation1', (qb) => qb.select('Model1.id'))
        .modifyGraph('model1Relation2', (qb) => qb.select('model2.id_col').orderBy('model2.id_col'))
        .modifyGraph('model1Relation2.model2Relation1', (qb) =>
          qb.select('Model1.id').orderBy('Model1.id'),
        )
        .then((res) => {
          expect(res).toEqual({
            id: 1,
            model1Id: 2,
            $afterFindCalled: 1,

            model1Relation1: {
              id: 2,
              $afterFindCalled: 1,
            },

            model1Relation2: [
              {
                idCol: 1,
                model1Id: 1,
                $afterFindCalled: 1,

                model2Relation1: [],
              },
              {
                idCol: 2,
                model1Id: 1,
                $afterFindCalled: 1,

                model2Relation1: [
                  {
                    id: 5,
                    $afterFindCalled: 1,
                    objectiontmpjoin0: 2,
                  },
                  {
                    id: 6,
                    $afterFindCalled: 1,
                    objectiontmpjoin0: 2,
                  },
                ],
              },
            ],
          });
        });
    });

    it('range should work', () => {
      return Model1.query()
        .where('id', 1)
        .withGraphFetched('[model1Relation1, model1Relation2]')
        .range(0, 0)
        .then((res) => {
          expect(res.results[0].model1Relation1.id).toBe(2);
          expect(res.results[0].model1Relation2).toHaveLength(2);
        });
    });

    it('range should work with joinEager', () => {
      return Model1.query()
        .where('Model1.id', 1)
        .withGraphJoined('model1Relation1')
        .range(0, 0)
        .then((res) => {
          expect(res.results[0].model1Relation1.id).toBe(2);
        });
    });

    it('resultSize should count the root models with joinEager', () => {
      // Model1 1 has two model1Relation2 children and Model1 6 has one,
      // so the join returns three rows.
      return Model1.query()
        .whereIn('Model1.id', [1, 6])
        .withGraphJoined('model1Relation2')
        .resultSize()
        .then((size) => {
          expect(size).toBe(2);
        });
    });

    it.skipIf(session.isPostgres() || session.isMsSql())(
      'resultSize should support aliased selections in groupBy and having with joinEager',
      () => {
        // Postgres and SQL Server don't support selection aliases in `having`.
        const query = Model1.query()
          .select('Model1.id', 'Model1.model1Prop1 as prop')
          .whereIn('Model1.id', [1, 6])
          .withGraphJoined('model1Relation2')
          .groupBy('Model1.id', 'model1Relation2.id_col')
          .having('prop', '=', 'hello 1');

        return Promise.all([query, query.resultSize()]).then(([models, size]) => {
          expect(models.map((it) => it.id)).toEqual([1]);
          expect(size).toBe(1);
        });
      },
    );

    it('resultSize should support a column selected twice with groupBy and joinEager', async () => {
      const query = Model1.query()
        .select('Model1.*', 'Model1.id')
        .whereIn('Model1.id', [1, 6])
        .withGraphJoined('model1Relation2')
        .groupBy(
          'Model1.id',
          'model1Relation2.id_col',
          // SQL Server needs every selected column in `groupBy`.
          ...(session.isMsSql()
            ? [
                'Model1.model1Id',
                'Model1.model1Prop1',
                'Model1.model1Prop2',
                'model1Relation2.model1_id',
                'model1Relation2.model2_prop1',
                'model1Relation2.model2_prop2',
              ]
            : []),
        );

      const [models, size] = await Promise.all([query, query.resultSize()]);
      expect(models.map((it) => it.id).sort()).toEqual([1, 6]);
      expect(size).toBe(2);
    });

    it.skipIf(session.isMsSql())(
      'resultSize should support an aliased selection in groupBy with joinEager',
      async () => {
        // SQL Server doesn't support selection aliases in `groupBy`.
        const query = Model1.query()
          .select('Model1.id', 'Model1.model1Prop1 as prop')
          .whereIn('Model1.id', [1, 6])
          .withGraphJoined('model1Relation2')
          .groupBy('Model1.id', 'prop', 'model1Relation2.id_col');

        const [models, size] = await Promise.all([query, query.resultSize()]);
        expect(models.map((it) => it.id).sort()).toEqual([1, 6]);
        expect(size).toBe(2);
      },
    );

    it.skipIf(!session.isPostgres())(
      'resultSize and page should respect distinctOn with joinEager',
      async () => {
        // `model1Prop2` is null for all models, so `distinctOn` returns one.
        for (const relation of ['model1Relation1', 'model1Relation2']) {
          const query = Model1.query()
            .distinctOn('Model1.model1Prop2')
            .withGraphJoined(relation)
            .orderBy('Model1.model1Prop2')
            .orderBy('Model1.id');

          const [models, size, page] = await Promise.all([
            query,
            query.resultSize(),
            query.clone().page(0, 10),
          ]);
          expect(models.map((it) => it.id)).toEqual([1]);
          expect(size).toBe(1);
          expect(page.total).toBe(1);
        }
      },
    );

    it.skipIf(!session.isPostgres())(
      'resultSize and page should respect the order of distinctOn on a joined column with joinEager',
      async () => {
        await session.populate([
          {
            id: 1,
            model1Relation2: [
              { idCol: 1, model2Prop1: 'a' },
              { idCol: 2, model2Prop1: 'b' },
            ],
          },
          {
            id: 2,
            model1Relation2: [{ idCol: 3, model2Prop1: 'b' }],
          },
        ]);

        // The order decides whether 'b' picks the row of model 1 or model 2, and
        // without it, `distinctOn` picks the same row in both directions.
        for (const direction of ['asc', 'desc']) {
          const query = Model1.query()
            .distinctOn('model1Relation2.model2_prop1')
            .withGraphJoined('model1Relation2')
            .orderBy('model1Relation2.model2_prop1')
            .orderBy('Model1.id', direction);

          const [models, size, page] = await Promise.all([
            query,
            query.resultSize(),
            query.clone().page(0, 10),
          ]);
          expect(models.map((it) => it.id).sort()).toEqual(direction === 'asc' ? [1] : [1, 2]);
          expect(size).toBe(models.length);
          expect(page.total).toBe(models.length);
        }
      },
    );

    it('page should count the root models with joinEager', () => {
      return Model1.query()
        .whereIn('Model1.id', [1, 6])
        .withGraphJoined('model1Relation2')
        .orderBy('Model1.id')
        .page(0, 10)
        .then((res) => {
          expect(res.total).toBe(2);
          expect(res.results.map((it) => it.id)).toEqual([1, 6]);
          expect(res.results[0].model1Relation2).toHaveLength(2);
          expect(res.results[1].model1Relation2).toHaveLength(1);
        });
    });

    it('eager should not blow up');

    it('should be able to call eager from runBefore hook', () => {
      return Model1.query()
        .runBefore((_, builder) => {
          builder.withGraphFetched('model1Relation1');
        })
        .findOne({ model1Prop1: 'hello 1' })
        .then((result) => {
          expect(result).toMatchObject({
            model1Prop1: 'hello 1',

            model1Relation1: {
              model1Prop1: 'hello 2',
            },
          });
        });
    });

    it('should be able to call joinEager from runBefore hook', () => {
      return Model1.query()
        .runBefore((_, builder) => {
          builder.withGraphJoined('model1Relation1');
        })
        .where('Model1.model1Prop1', 'hello 1')
        .first()
        .then((result) => {
          expect(result).toMatchObject({
            model1Prop1: 'hello 1',

            model1Relation1: {
              model1Prop1: 'hello 2',
            },
          });
        });
    });

    it('eager should not blow up with an empty eager operation', () => {
      return Model1.query()
        .modifyGraph('foo', () => {})
        .findOne({ model1Prop1: 'hello 1' })
        .then((result) => {
          expect(result.model1Prop1).toBe('hello 1');
        });
    });

    it('should be able to order by ambiguous column (issue #1287 regression)', () => {
      return Model1.query()
        .findOne('Model1.model1Prop1', 'hello 1')
        .withGraphJoined('model1Relation1')
        .orderBy('id')
        .execute();
    });

    if (session.isPostgres()) {
      it('should be able to use a distinctOn trick to fetch one of each related item', async () => {
        await session.populate({
          id: 1,
          model1Prop1: 'root',
          model1Relation2: [
            {
              idCol: 1,
              model2Prop1: '1',
              model2Relation1: [
                {
                  id: 2,
                  model1Prop1: '11',
                },
                {
                  id: 3,
                  model1Prop1: '12',
                },
              ],
            },
            {
              idCol: 2,

              model2Prop1: '2',
              model2Relation1: [
                {
                  id: 4,
                  model1Prop1: '21',
                },
                {
                  id: 5,
                  model1Prop1: '22',
                },
              ],
            },
            {
              idCol: 3,

              model2Prop1: '3',
              model2Relation1: [
                {
                  id: 6,
                  model1Prop1: '31',
                },
                {
                  id: 7,
                  model1Prop1: '32',
                },
              ],
            },
          ],
        });

        const result = await Model2.query()
          .withGraphFetched('model2Relation1(onlyFirst)')
          .orderBy('id_col')
          .modifiers({
            onlyFirst(query) {
              query
                .orderBy(['model2Id', { column: 'model1Prop1', order: 'desc' }])
                .distinctOn('model2Id');
            },
          });

        expect(result).toEqual([
          {
            idCol: 1,
            model1Id: 1,
            model2Prop1: '1',
            model2Prop2: null,
            model2Relation1: [
              {
                id: 3,
                model1Id: null,
                model1Prop1: '12',
                model1Prop2: null,
                aliasedExtra: null,
                $afterFindCalled: 1,
              },
            ],
            $afterFindCalled: 1,
          },
          {
            idCol: 2,
            model1Id: 1,
            model2Prop1: '2',
            model2Prop2: null,
            model2Relation1: [
              {
                id: 5,
                model1Id: null,
                model1Prop1: '22',
                model1Prop2: null,
                aliasedExtra: null,
                $afterFindCalled: 1,
              },
            ],
            $afterFindCalled: 1,
          },
          {
            idCol: 3,
            model1Id: 1,
            model2Prop1: '3',
            model2Prop2: null,
            model2Relation1: [
              {
                id: 7,
                model1Id: null,
                model1Prop1: '32',
                model1Prop2: null,
                aliasedExtra: null,
                $afterFindCalled: 1,
              },
            ],
            $afterFindCalled: 1,
          },
        ]);
      });
    }

    it.skipIf(!session.isPostgres())('distinctOn should not select its columns', async () => {
      for (const method of ['withGraphFetched', 'withGraphJoined']) {
        const [{ model1Relation2, ...model }] = await Model1.query()
          .distinctOn('Model1.model1Prop1')
          .where('Model1.id', 1)
          [method]('model1Relation2(oneOfEach)')
          .modifiers({
            oneOfEach(query) {
              query.distinctOn('model1_id');
            },
          });

        expect(model).toEqual({
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
        });
        expect(model1Relation2).toHaveLength(1);
        expect(Object.keys(model1Relation2[0]).sort()).toEqual([
          '$afterFindCalled',
          'idCol',
          'model1Id',
          'model2Prop1',
          'model2Prop2',
        ]);
      }
    });

    for (const method of ['withGraphFetched', 'withGraphJoined', 'allowGraph']) {
      it(`${method}() should fail with a clear error when a duplicate relation is detected`, () => {
        const expression = '[model1Relation1, model1Relation1.model1Relation2]';

        expect(() => Model1.query()[method](expression)).toThrow(
          expect.objectContaining({
            constructor: ValidationError,
            type: 'RelationExpression',
            message:
              `Invalid relation expression "${expression}": Duplicate relation name ` +
              '"model1Relation1". For example, use "model1Relation1.[foo, bar]" instead of ' +
              '"[model1Relation1.foo, model1Relation1.bar]".',
          }),
        );
      });
    }

    it('joinRelated() should fail with a clear error when a duplicate relation is detected', () => {
      const builder = Model1.query().joinRelated(
        '[model1Relation1, model1Relation1.model1Relation2]',
      );

      expect(() => builder.toKnexQuery()).toThrow(
        'Duplicate relation name "model1Relation1". For example, use "model1Relation1.[foo, bar]" ' +
          'instead of "[model1Relation1.foo, model1Relation1.bar]".',
      );
    });

    describe('skipFetched option', () => {
      let TestModel;
      let queries;

      beforeEach(() => {
        queries = [];

        // Create a dummy mock so that we can bind Model1 to it.
        TestModel = Model1.bindKnex(
          mockKnexFactory(session.knex, function (mock, oldImpl, args) {
            queries.push(this.toSQL());
            return oldImpl.apply(this, args);
          }),
        );
      });

      it('should not fetch an existing relation when `skipFetched` option is true', async () => {
        const models = await TestModel.query().withGraphFetched('model1Relation1');

        queries = [];
        const result = await TestModel.fetchGraph(models, 'model1Relation1', { skipFetched: true });

        expect(queries).toHaveLength(0);
        expect(models).toEqual(result);
      });

      it('should not fetch an existing nested relation when `skipFetched` option is true', async () => {
        let result = await TestModel.query()
          .withGraphFetched('model1Relation1')
          .whereIn('id', [1, 2, 3]);

        queries = [];
        result = await TestModel.fetchGraph(result, 'model1Relation1.model1Relation1', {
          skipFetched: true,
        });

        expect(queries).toHaveLength(1);
      });

      it('should fetch an existing relation when `skipFetched` option is true if not all needed relation props exist', async () => {
        const model = await TestModel.query().withGraphFetched('model1Relation1').findById(1);

        // Deleting this will cause `fetchGraph` to reload model.model1Relation1
        // because it needs it to have the `model1Id` present for the next level
        // of fetching.
        delete model.model1Relation1.model1Id;

        queries = [];
        await model.$fetchGraph('model1Relation1.model1Relation1', { skipFetched: true });

        expect(queries).toHaveLength(2);
        expect(model).toEqual({
          id: 1,
          model1Id: 2,
          model1Prop1: 'hello 1',
          model1Prop2: null,
          $afterFindCalled: 1,
          model1Relation1: {
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 3,
              model1Id: 4,
              model1Prop1: 'hello 3',
              $afterFindCalled: 1,
              model1Prop2: null,
            },
          },
        });
      });

      it('should fetch an existing relation when `skipFetched` option is true if not all needed relation props exist (2)', async () => {
        const model = await TestModel.query().withGraphFetched('model1Relation1').findById(1);

        // Deleting this will cause `fetchGraph` to reload model.model1Relation1
        // because it needs it to have the `id` present for the next level
        // of fetching.
        delete model.model1Relation1.id;

        queries = [];
        await model.$fetchGraph('model1Relation1.model1Relation2', { skipFetched: true });

        expect(queries).toHaveLength(2);
      });

      it('should fetch other relations when `skipFetched` option is true', async () => {
        const models = await TestModel.query().withGraphFetched('model1Relation1').where('id', 1);

        queries = [];
        const result = await TestModel.fetchGraph(
          models,
          '[model1Relation1.model1Relation1, model1Relation2(orderById)]',
          { skipFetched: true },
        );

        expect(queries).toHaveLength(2);
        expect(result).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 2,
              model1Id: 3,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 3,
                model1Id: 4,
                model1Prop1: 'hello 3',
                $afterFindCalled: 1,
                model1Prop2: null,
              },
            },
            model1Relation2: [
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                $afterFindCalled: 1,
                model2Prop2: null,
              },
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                $afterFindCalled: 1,
                model2Prop2: null,
              },
            ],
          },
        ]);
      });

      it('should work with nested relations', async () => {
        const models = await TestModel.query()
          .withGraphFetched('model1Relation1.model1Relation1')
          .where('id', 1);

        queries = [];
        const result = await TestModel.fetchGraph(
          models,
          '[model1Relation1.model1Relation1, model1Relation2(orderById)]',
          { skipFetched: true },
        );

        expect(queries).toHaveLength(1);
        expect(result).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 2,
              model1Id: 3,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 3,
                model1Id: 4,
                model1Prop1: 'hello 3',
                $afterFindCalled: 1,
                model1Prop2: null,
              },
            },
            model1Relation2: [
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                $afterFindCalled: 1,
                model2Prop2: null,
              },
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                $afterFindCalled: 1,
                model2Prop2: null,
              },
            ],
          },
        ]);
      });

      it('should work with nested and parallel relations', async () => {
        const models = await TestModel.query()
          .withGraphFetched('[model1Relation1.model1Relation1, model1Relation2(orderById)]')
          .where('id', 1);

        queries = [];
        const result = await TestModel.fetchGraph(
          models,
          '[model1Relation1.model1Relation1, model1Relation2]',
          { skipFetched: true },
        );

        expect(queries).toHaveLength(0);
        expect(result).toEqual([
          {
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
            model1Relation1: {
              id: 2,
              model1Id: 3,
              model1Prop1: 'hello 2',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation1: {
                id: 3,
                model1Id: 4,
                model1Prop1: 'hello 3',
                $afterFindCalled: 1,
                model1Prop2: null,
              },
            },
            model1Relation2: [
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                $afterFindCalled: 1,
                model2Prop2: null,
              },
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                $afterFindCalled: 1,
                model2Prop2: null,
              },
            ],
          },
        ]);
      });
    });

    describe('QueryBuilder.withGraphJoined', () => {
      it('select should work', () => {
        return Model1.query()
          .select('Model1.id', 'Model1.model1Prop1')
          .where('Model1.id', 1)
          .where('model1Relation2.id_col', 2)
          .where('model1Relation2:model2Relation1.id', 6)
          .withGraphJoined('[model1Relation1, model1Relation2.model2Relation1]')
          .then((models) => {
            expect(models).toEqual([
              {
                id: 1,
                model1Prop1: 'hello 1',
                $afterFindCalled: 1,

                model1Relation1: {
                  id: 2,
                  model1Id: 3,
                  model1Prop1: 'hello 2',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                },

                model1Relation2: [
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,

                    model2Relation1: [
                      {
                        id: 6,
                        model1Id: 7,
                        model1Prop1: 'hello 6',
                        model1Prop2: null,
                        aliasedExtra: 'extra 6',
                        $afterFindCalled: 1,
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });

      it('distinct * should remove duplicate rows', async () => {
        // Join the two `model1Relation2` rows of model 1 to have duplicate rows:
        const models = await Model1.query()
          .distinct('*')
          .joinRelated('model1Relation2')
          .withGraphJoined('model1Relation1')
          .orderBy('Model1.id')
          .limit(2);

        expect(models.map((it) => it.id)).toEqual([1, 4]);
      });

      it.skipIf(!session.isPostgres())(
        'distinctOn + select * should select the distinct column',
        async () => {
          const models = await Model1.query()
            .distinctOn('Model1.model1Prop1')
            .select('*')
            .where('Model1.id', 1)
            .withGraphJoined('model1Relation2');

          expect(models.map((it) => it.model1Prop1)).toEqual(['hello 1']);
        },
      );

      it("should fail if the user's selections select other columns under the names of its columns", async () => {
        const expectError = async (query, selection, alias, column) => {
          const err = await query.withGraphJoined('model1Relation1').catch((err) => err);

          expect(err.message).toBe(
            `withGraphJoined: the selection '${selection}' selects '${alias}', ` +
              `the name under which the column '${column}' is selected. ` +
              'Select it under a different name.',
          );
        };

        await expectError(
          Model1.query().select('*', ref('Model1.id').as('model1Prop1')),
          'Model1.id as model1Prop1',
          'model1Prop1',
          'Model1.model1Prop1',
        );
        await expectError(
          Model1.query().select('Model1.*', 'model1Relation1.id'),
          'model1Relation1.id',
          'id',
          'Model1.id',
        );
      });

      // Disabled for sqlite because it doesn't have `concat` function :)
      if (!session.isSqlite()) {
        it('select * + raw should work', () => {
          return Model1.query()
            .select(
              'Model1.*',
              raw(`concat(??, ' - ', ??) as "rawThingy"`, 'Model1.model1Prop1', 'Model1.id'),
            )
            .where('Model1.id', 1)
            .where('model1Relation2.id_col', 2)
            .where('model1Relation2:model2Relation1.id', 6)
            .withGraphJoined('[model1Relation1, model1Relation2.model2Relation1]')
            .then((models) => {
              expect(models).toEqual([
                {
                  id: 1,
                  model1Prop1: 'hello 1',
                  model1Prop2: null,
                  model1Id: 2,
                  rawThingy: 'hello 1 - 1',
                  $afterFindCalled: 1,

                  model1Relation1: {
                    id: 2,
                    model1Id: 3,
                    model1Prop1: 'hello 2',
                    model1Prop2: null,
                    $afterFindCalled: 1,
                  },

                  model1Relation2: [
                    {
                      idCol: 2,
                      model1Id: 1,
                      model2Prop1: 'hejsan 2',
                      model2Prop2: null,
                      $afterFindCalled: 1,

                      model2Relation1: [
                        {
                          id: 6,
                          model1Id: 7,
                          model1Prop1: 'hello 6',
                          model1Prop2: null,
                          aliasedExtra: 'extra 6',
                          $afterFindCalled: 1,
                        },
                      ],
                    },
                  ],
                },
              ]);
            });
        });

        it('raw select should work in modifier', () => {
          return Model1.query()
            .select('Model1.id')
            .where('Model1.id', 1)
            .where('model1Relation2.id_col', 2)
            .where('model1Relation2:model2Relation1.id', 6)
            .withGraphJoined('[model1Relation1(rawStuff), model1Relation2.model2Relation1]')
            .modifiers({
              rawStuff(builder) {
                builder.select(
                  raw(`concat(??, ' - ', ?? * 2)`, 'model1Prop1', 'id').as('rawThingy'),
                );
              },
            })
            .then((models) => {
              expect(models).toEqual([
                {
                  id: 1,
                  $afterFindCalled: 1,

                  model1Relation1: {
                    rawThingy: 'hello 2 - 4',
                    $afterFindCalled: 1,
                  },

                  model1Relation2: [
                    {
                      idCol: 2,
                      model1Id: 1,
                      model2Prop1: 'hejsan 2',
                      model2Prop2: null,
                      $afterFindCalled: 1,

                      model2Relation1: [
                        {
                          id: 6,
                          model1Id: 7,
                          model1Prop1: 'hello 6',
                          model1Prop2: null,
                          aliasedExtra: 'extra 6',
                          $afterFindCalled: 1,
                        },
                      ],
                    },
                  ],
                },
              ]);
            });
        });
      }

      it('aliased subquery selects should work in modifier', () => {
        return Model1.query()
          .select('Model1.id')
          .where('Model1.id', 1)
          .withGraphJoined('model1Relation2(subqueries)')
          .modifiers({
            subqueries(builder) {
              builder.select(
                'id_col',
                Model1.query()
                  .select('model1Prop1')
                  .where('Model1.id', ref('model2.model1_id'))
                  .as('owner_prop'),
                session
                  .knex('Model1')
                  .select('id')
                  .where('Model1.id', session.knex.ref('model2.model1_id'))
                  .as('owner_id'),
              );
            },
          })
          .then((models) => {
            expect(models).toHaveLength(1);
            expect(models[0].id).toBe(1);
            expect(sortBy(models[0].model1Relation2, 'idCol')).toEqual([
              { idCol: 1, ownerProp: 'hello 1', ownerId: 1, $afterFindCalled: 1 },
              { idCol: 2, ownerProp: 'hello 1', ownerId: 1, $afterFindCalled: 1 },
            ]);
          });
      });

      it('aliased subquery selects should not change which other columns are selected', () => {
        return Model1.query()
          .select(
            Model2.query()
              .count('*')
              .where('model2.model1_id', ref('Model1.id'))
              .as('relation2Count'),
          )
          .where('Model1.id', 1)
          .withGraphJoined('model1Relation2(subquery)')
          .modifiers({
            subquery(builder) {
              builder.select(
                Model1.query()
                  .select('model1Prop1')
                  .where('Model1.id', ref('model2.model1_id'))
                  .as('owner_prop'),
              );
            },
          })
          .then((models) => {
            expect(models).toHaveLength(1);
            expect(+models[0].relation2Count).toBe(2);
            expect(
              pick(models[0], ['id', 'model1Id', 'model1Prop1', 'model1Prop2', '$afterFindCalled']),
            ).toEqual({
              id: 1,
              model1Id: 2,
              model1Prop1: 'hello 1',
              model1Prop2: null,
              $afterFindCalled: 1,
            });
            expect(sortBy(models[0].model1Relation2, 'idCol')).toEqual([
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                model2Prop2: null,
                ownerProp: 'hello 1',
                $afterFindCalled: 1,
              },
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                model2Prop2: null,
                ownerProp: 'hello 1',
                $afterFindCalled: 1,
              },
            ]);
          });
      });

      it('raw selects with an alias in the sql should work in modifier', () => {
        return Model1.query()
          .select('Model1.id')
          .where('Model1.id', 1)
          .withGraphJoined('model1Relation2(rawAliases)')
          .modifiers({
            rawAliases(builder) {
              builder.select(
                'id_col',
                raw('upper(model2_prop1) AS "upper_prop"'),
                raw('lower(??) as ??', ['model2_prop1', 'lower_prop']),
              );
            },
          })
          .then((models) => {
            expect(models).toHaveLength(1);
            expect(models[0].id).toBe(1);
            expect(sortBy(models[0].model1Relation2, 'idCol')).toEqual([
              { idCol: 1, upperProp: 'HEJSAN 1', lowerProp: 'hejsan 1', $afterFindCalled: 1 },
              { idCol: 2, upperProp: 'HEJSAN 2', lowerProp: 'hejsan 2', $afterFindCalled: 1 },
            ]);
          });
      });

      it('raw selects with an alias in the sql should not change which other columns are selected', () => {
        return Model1.query()
          .select(raw('upper(??) as "upper_prop"', 'Model1.model1Prop1'))
          .where('Model1.id', 1)
          .withGraphJoined('model1Relation2(rawAlias)')
          .modifiers({
            rawAlias(builder) {
              builder.select(raw('upper(model2_prop1) AS "upper_prop"'));
            },
          })
          .then((models) => {
            expect(models).toHaveLength(1);
            expect(
              pick(models[0], [
                'id',
                'model1Id',
                'model1Prop1',
                'model1Prop2',
                'upper_prop',
                '$afterFindCalled',
              ]),
            ).toEqual({
              id: 1,
              model1Id: 2,
              model1Prop1: 'hello 1',
              model1Prop2: null,
              upper_prop: 'HELLO 1',
              $afterFindCalled: 1,
            });
            expect(sortBy(models[0].model1Relation2, 'idCol')).toEqual([
              {
                idCol: 1,
                model1Id: 1,
                model2Prop1: 'hejsan 1',
                model2Prop2: null,
                upperProp: 'HEJSAN 1',
                $afterFindCalled: 1,
              },
              {
                idCol: 2,
                model1Id: 1,
                model2Prop1: 'hejsan 2',
                model2Prop2: null,
                upperProp: 'HEJSAN 2',
                $afterFindCalled: 1,
              },
            ]);
          });
      });

      it('select should work with alias', () => {
        return Model1.query()
          .select('Model1.id as theId', 'Model1.model1Prop1 as leProp')
          .where('Model1.id', 1)
          .where('model1Relation2.id_col', 2)
          .where('model1Relation2:model2Relation1.id', 6)
          .withGraphJoined('[model1Relation1, model1Relation2.model2Relation1]')
          .then((models) => {
            expect(models).toEqual([
              {
                theId: 1,
                leProp: 'hello 1',
                $afterFindCalled: 1,

                model1Relation1: {
                  id: 2,
                  model1Id: 3,
                  model1Prop1: 'hello 2',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                },

                model1Relation2: [
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,

                    model2Relation1: [
                      {
                        id: 6,
                        model1Id: 7,
                        model1Prop1: 'hello 6',
                        model1Prop2: null,
                        aliasedExtra: 'extra 6',
                        $afterFindCalled: 1,
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });

      it('should be able to change the join type', () => {
        return Model1.query()
          .select('Model1.id', 'Model1.model1Prop1')
          .withGraphJoined('model1Relation2', { joinOperation: 'innerJoin' })
          .orderBy(['Model1.id', 'model1Relation2.id_col'])
          .then((models) => {
            // With innerJoin we should only get `Model1` instances that have one
            // or more `model2Relation2` relations.
            expect(models).toEqual([
              {
                id: 1,
                model1Prop1: 'hello 1',
                $afterFindCalled: 1,
                model1Relation2: [
                  {
                    idCol: 1,
                    model1Id: 1,
                    model2Prop1: 'hejsan 1',
                    model2Prop2: null,
                    $afterFindCalled: 1,
                  },
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,
                  },
                ],
              },
              {
                id: 4,
                model1Prop1: 'hello 4',
                $afterFindCalled: 1,
                model1Relation2: [
                  {
                    idCol: 4,
                    model1Id: 4,
                    model2Prop1: 'hejsan 4',
                    model2Prop2: null,
                    $afterFindCalled: 1,
                  },
                ],
              },
              {
                id: 6,
                model1Prop1: 'hello 6',
                $afterFindCalled: 1,
                model1Relation2: [
                  {
                    idCol: 3,
                    model1Id: 6,
                    model2Prop1: 'hejsan 3',
                    model2Prop2: null,
                    $afterFindCalled: 1,
                  },
                ],
              },
            ]);
          });
      });

      it('should use the join type of each withGraphJoined call (#2125)', () => {
        const summarize = (models) =>
          models.map((model) => ({
            id: model.id,
            model1Relation1: model.model1Relation1.id,
            model1Relation2: model.model1Relation2.map((it) => it.idCol).sort(),
          }));

        // Only `Model1` instances that have a `model1Relation1` should be
        // returned, with all their `model1Relation2` relations, if any.
        const expected = [
          { id: 1, model1Relation1: 2, model1Relation2: [1, 2] },
          { id: 2, model1Relation1: 3, model1Relation2: [] },
          { id: 3, model1Relation1: 4, model1Relation2: [] },
          { id: 6, model1Relation1: 7, model1Relation2: [3] },
          { id: 8, model1Relation1: 9, model1Relation2: [] },
        ];

        return Promise.all([
          Model1.query()
            .withGraphJoined('model1Relation1', { joinOperation: 'innerJoin' })
            .withGraphJoined('model1Relation2', { joinOperation: 'leftJoin' })
            .orderBy('Model1.id'),
          Model1.query()
            .withGraphJoined('model1Relation2', { joinOperation: 'leftJoin' })
            .withGraphJoined('model1Relation1', { joinOperation: 'innerJoin' })
            .orderBy('Model1.id'),
          Model1.query()
            .withGraphJoined('model1Relation1', { joinOperation: 'innerJoin' })
            .withGraphJoined('model1Relation2')
            .orderBy('Model1.id'),
        ]).then((results) => {
          for (const models of results) {
            expect(summarize(models)).toEqual(expected);
          }
        });
      });

      it('should be able to change the separator', () => {
        return Model1.query()
          .select('Model1.id', 'Model1.model1Prop1')
          .where('Model1.id', 1)
          .where('model1Relation2.id_col', 2)
          .where('model1Relation2->model2Relation1.id', 6)
          .withGraphJoined('[model1Relation1, model1Relation2.model2Relation1]', {
            separator: '->',
          })
          .then((models) => {
            expect(models).toEqual([
              {
                id: 1,
                model1Prop1: 'hello 1',
                $afterFindCalled: 1,

                model1Relation1: {
                  id: 2,
                  model1Id: 3,
                  model1Prop1: 'hello 2',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                },

                model1Relation2: [
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,

                    model2Relation1: [
                      {
                        id: 6,
                        model1Id: 7,
                        model1Prop1: 'hello 6',
                        model1Prop2: null,
                        aliasedExtra: 'extra 6',
                        $afterFindCalled: 1,
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });

      it('should be able to refer to joined relations with syntax Table:rel1:rel2.col', () => {
        return Model1.query()
          .where('Model1.id', 1)
          .where('model1Relation2.id_col', 2)
          .withGraphJoined('[model1Relation1, model1Relation2.model2Relation1]')
          .orderBy(['Model1.id', 'model1Relation2:model2Relation1.id'])
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
                  model1Id: 3,
                  model1Prop1: 'hello 2',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                },

                model1Relation2: [
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,

                    model2Relation1: [
                      {
                        id: 5,
                        model1Id: null,
                        model1Prop1: 'hello 5',
                        model1Prop2: null,
                        aliasedExtra: 'extra 5',
                        $afterFindCalled: 1,
                      },
                      {
                        id: 6,
                        model1Id: 7,
                        model1Prop1: 'hello 6',
                        model1Prop2: null,
                        aliasedExtra: 'extra 6',
                        $afterFindCalled: 1,
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });

      it('should be able to give aliases for relations', () => {
        return Model1.query()
          .where('Model1.id', 1)
          .where('mr2.id_col', 2)
          .withGraphJoined('[model1Relation1, model1Relation2.model2Relation1]', {
            aliases: {
              model1Relation2: 'mr2',
            },
          })
          .orderBy(['Model1.id', 'mr2:model2Relation1.id'])
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
                  model1Id: 3,
                  model1Prop1: 'hello 2',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                },

                model1Relation2: [
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,

                    model2Relation1: [
                      {
                        id: 5,
                        model1Id: null,
                        model1Prop1: 'hello 5',
                        model1Prop2: null,
                        aliasedExtra: 'extra 5',
                        $afterFindCalled: 1,
                      },
                      {
                        id: 6,
                        model1Id: 7,
                        model1Prop1: 'hello 6',
                        model1Prop2: null,
                        aliasedExtra: 'extra 6',
                        $afterFindCalled: 1,
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });

      // MySQL allows 256 characters, SQLite has no limit.
      it.skipIf(!session.isPostgres())(
        'relation references longer that 63 chars should throw an exception on postgres',
        () => {
          return Model1.query()
            .where('Model1.id', 1)
            .withGraphJoined('[model1Relation1.model1Relation1.model1Relation1.model1Relation1]')
            .then(() => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err).toBeInstanceOf(ValidationError);
              expect(err.type).toBe('RelationExpression');
              expect(err.modelClass).toBe(Model1);
              expect(err.message).toBe(
                'identifier model1Relation1:model1Relation1:model1Relation1:model1Relation1:id is over 63 characters long and would be truncated by the database engine. Use the `minimize` option of withGraphJoined() to shorten the aliases.',
              );
            });
        },
      );

      it.skipIf(session.isPostgres())(
        'relation references longer that 63 chars should work on databases with a higher limit',
        async () => {
          const models = await Model1.query()
            .where('Model1.id', 1)
            .withGraphJoined('[model1Relation1.model1Relation1.model1Relation1.model1Relation1]');

          expect(models).toHaveLength(1);
          expect(models[0].model1Relation1.model1Relation1.id).toBe(3);
        },
      );

      it('relation references longer that 63 chars should NOT throw an exception if minimize: true option is given', () => {
        return Model1.query()
          .where('Model1.id', 1)
          .withGraphJoined('[model1Relation1.model1Relation1.model1Relation1.model1Relation1]', {
            minimize: true,
          })
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
                  model1Id: 3,
                  model1Prop1: 'hello 2',
                  model1Prop2: null,
                  $afterFindCalled: 1,
                  model1Relation1: {
                    id: 3,
                    model1Id: 4,
                    model1Prop1: 'hello 3',
                    model1Prop2: null,
                    $afterFindCalled: 1,
                    model1Relation1: {
                      id: 4,
                      model1Id: null,
                      model1Prop1: 'hello 4',
                      model1Prop2: null,
                      $afterFindCalled: 1,
                      model1Relation1: null,
                    },
                  },
                },
              },
            ]);
          });
      });

      it('infinitely recursive expressions should fail', () => {
        return Model1.query()
          .where('Model1.id', 1)
          .withGraphJoined('model1Relation1.^')
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err.type).toBe('RelationExpression');
            expect(err.message).toBe(
              'recursion depth of eager expression model1Relation1.^ too big for JoinEagerAlgorithm',
            );
          });
      });

      it('should fail if given missing filter', () => {
        return Model1.query()
          .where('id', 1)
          .withGraphFetched('model1Relation2(missingFilter)')
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err).toBeInstanceOf(ValidationError);
            expect(err.type).toBe('RelationExpression');
            expect(err.message).toBe(
              'could not find modifier "missingFilter" for relation "model1Relation2"',
            );
          });
      });

      it('should fail if given missing relation', () => {
        return Model1.query()
          .where('id', 1)
          .withGraphFetched('invalidRelation')
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err).toBeInstanceOf(ValidationError);
            expect(err.type).toBe('RelationExpression');
            expect(err.message).toBe('unknown relation "invalidRelation" in an eager expression');
          });
      });

      it('should fail if given invalid relation expression', () => {
        return Model1.query()
          .where('id', 1)
          .withGraphFetched('invalidRelation')
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err).toBeInstanceOf(ValidationError);
            expect(err.type).toBe('RelationExpression');
            expect(err.message).toBe('unknown relation "invalidRelation" in an eager expression');
          });
      });
    });

    describe('QueryBuilder.modifyGraph', () => {
      it('should filter the eager query using relation expressions as paths', () => {
        return Promise.all(
          ['withGraphFetched', 'withGraphJoined'].map((method) => {
            return Model1.query()
              .where('Model1.id', 1)
              .modifyGraph('model1Relation2.model2Relation1', (builder) => {
                builder.where('Model1.id', 6);
              })
              [method]('model1Relation2.model2Relation1.[model1Relation1, model1Relation2]')
              .modifyGraph('model1Relation2', (builder) => {
                builder.where('model2_prop1', 'hejsan 2');
              })
              .then((models) => {
                expect(models[0].model1Relation2).toHaveLength(1);
                expect(models[0].model1Relation2[0].model2Prop1).toBe('hejsan 2');

                expect(models[0].model1Relation2[0].model2Relation1).toHaveLength(1);
                expect(models[0].model1Relation2[0].model2Relation1[0].id).toBe(6);
              });
          }),
        );
      });

      it('should accept a modifier name', () => {
        return Promise.all(
          ['withGraphFetched', 'withGraphJoined'].map((method) => {
            return Model1.query()
              .where('Model1.id', 1)
              [method]('model1Relation2.model2Relation1')
              .modifyGraph('model1Relation2.model2Relation1', 'select:model1Prop1')
              .then((models) => {
                const model2 = models[0].model1Relation2.find((it) => it.idCol === 2);
                expect(Object.keys(model2.model2Relation1[0])).toEqual([
                  'model1Prop1',
                  '$afterFindCalled',
                ]);
              });
          }),
        );
      });

      it('should accept a list of modifier names', () => {
        return Promise.all(
          ['withGraphFetched', 'withGraphJoined'].map((method) => {
            return Model1.query()
              .where('Model1.id', 1)
              [method]('model1Relation1')
              .modifyGraph('model1Relation1', ['select:id', 'select:model1Prop1'])
              .then((models) => {
                expect(Object.keys(models[0].model1Relation1)).toEqual([
                  'id',
                  'model1Prop1',
                  '$afterFindCalled',
                ]);
              });
          }),
        );
      });

      it('should implicitly add selects for join columns if they are omitted in modifyGraph', () => {
        return Promise.all(
          ['withGraphFetched', 'withGraphJoined'].map((method) => {
            return Model1.query()
              .where('Model1.id', 1)
              .column('Model1.model1Prop1')
              [method]('model1Relation2.model2Relation1.[model1Relation1, model1Relation2]')
              .modifyGraph('model1Relation2', (builder) => {
                builder.select('model2_prop1');
              })
              .modifyGraph('model1Relation2.model2Relation1', (builder) => {
                builder.distinct('model1Prop1');
              })
              .modifyGraph('model1Relation2.model2Relation1.model1Relation1', (builder) => {
                builder.select('model1Prop1');
              })
              .modifyGraph('model1Relation2.model2Relation1.model1Relation2', (builder) => {
                builder.select('model2_prop1');
              })
              .then((models) => {
                models[0].model1Relation2 = sortBy(models[0].model1Relation2, 'model2Prop1');
                models[0].model1Relation2[1].model2Relation1 = sortBy(
                  models[0].model1Relation2[1].model2Relation1,
                  'model1Prop1',
                );

                expect(models).toEqual([
                  {
                    model1Prop1: 'hello 1',
                    $afterFindCalled: 1,

                    model1Relation2: [
                      {
                        model2Prop1: 'hejsan 1',
                        $afterFindCalled: 1,

                        model2Relation1: [],
                      },
                      {
                        model2Prop1: 'hejsan 2',
                        $afterFindCalled: 1,

                        model2Relation1: [
                          {
                            model1Prop1: 'hello 5',
                            $afterFindCalled: 1,

                            model1Relation1: null,
                            model1Relation2: [],
                          },
                          {
                            model1Prop1: 'hello 6',
                            $afterFindCalled: 1,

                            model1Relation1: {
                              model1Prop1: 'hello 7',
                              $afterFindCalled: 1,
                            },

                            model1Relation2: [
                              {
                                model2Prop1: 'hejsan 3',
                                $afterFindCalled: 1,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ]);
              });
          }),
        );
      });

      it('should implicitly add selects for join columns if they are aliased in modifyGraph', () => {
        return Model1.query()
          .where('Model1.id', 1)
          .column('Model1.model1Prop1')
          .withGraphFetched('model1Relation2.model2Relation1.[model1Relation1, model1Relation2]')
          .modifyGraph('model1Relation2', (builder) => {
            builder.select('model2_prop1', 'id_col as x1', 'model1_id as x2');
          })
          .modifyGraph('model1Relation2.model2Relation1', (builder) => {
            builder.select('model1Prop1', 'Model1.id as y1', 'Model1.model1Id as y2');
          })
          .modifyGraph('model1Relation2.model2Relation1.model1Relation1', (builder) => {
            builder.select('model1Prop1', 'Model1.id as y1', 'Model1.model1Id as y2');
          })
          .modifyGraph('model1Relation2.model2Relation1.model1Relation2', (builder) => {
            builder.select('model2_prop1', 'id_col as x1', 'model1_id as x2');
          })
          .then((models) => {
            models[0].model1Relation2 = sortBy(models[0].model1Relation2, 'model2Prop1');
            models[0].model1Relation2[1].model2Relation1 = sortBy(
              models[0].model1Relation2[1].model2Relation1,
              'model1Prop1',
            );

            expect(models).toEqual([
              {
                model1Prop1: 'hello 1',
                $afterFindCalled: 1,

                model1Relation2: [
                  {
                    model2Prop1: 'hejsan 1',
                    $afterFindCalled: 1,
                    x1: 1,
                    x2: 1,

                    model2Relation1: [],
                  },
                  {
                    model2Prop1: 'hejsan 2',
                    $afterFindCalled: 1,
                    x1: 2,
                    x2: 1,

                    model2Relation1: [
                      {
                        model1Prop1: 'hello 5',
                        $afterFindCalled: 1,
                        y1: 5,
                        y2: null,

                        model1Relation1: null,
                        model1Relation2: [],
                      },
                      {
                        model1Prop1: 'hello 6',
                        $afterFindCalled: 1,
                        y1: 6,
                        y2: 7,

                        model1Relation1: {
                          model1Prop1: 'hello 7',
                          $afterFindCalled: 1,
                          y1: 7,
                          y2: null,
                        },

                        model1Relation2: [
                          {
                            model2Prop1: 'hejsan 3',
                            $afterFindCalled: 1,
                            x1: 3,
                            x2: 6,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });

      it('should filter the eager query using relation expressions as paths (withGraphJoined)', () => {
        return Model1.query()
          .where('Model1.id', 1)
          .modifyGraph('model1Relation2.model2Relation1', (builder) => {
            builder.where('id', 6);
          })
          .withGraphJoined('model1Relation2.model2Relation1.[model1Relation1, model1Relation2]')
          .modifyGraph('model1Relation2', (builder) => {
            builder.where('model2_prop1', 'hejsan 2');
          })
          .modifyGraph('model1Relation2.model2Relation1', (builder) => {
            builder.select('model1Prop1');
          })
          .then((models) => {
            expect(models).toEqual([
              {
                id: 1,
                model1Id: 2,
                model1Prop1: 'hello 1',
                model1Prop2: null,
                $afterFindCalled: 1,

                model1Relation2: [
                  {
                    idCol: 2,
                    model1Id: 1,
                    model2Prop1: 'hejsan 2',
                    model2Prop2: null,
                    $afterFindCalled: 1,

                    model2Relation1: [
                      {
                        model1Prop1: 'hello 6',
                        $afterFindCalled: 1,

                        model1Relation1: {
                          id: 7,
                          model1Id: null,
                          model1Prop1: 'hello 7',
                          model1Prop2: null,
                          $afterFindCalled: 1,
                        },

                        model1Relation2: [
                          {
                            idCol: 3,
                            model1Id: 6,
                            model2Prop1: 'hejsan 3',
                            model2Prop2: null,
                            $afterFindCalled: 1,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ]);
          });
      });
    });

    it('should merge eager expressions', () => {
      return Model1.query()
        .where('id', 1)
        .withGraphFetched('model1Relation2')
        .withGraphFetched('model1Relation2.model2Relation1.model1Relation1')
        .withGraphFetched('model1Relation2.model2Relation1.model1Relation2')
        .first()
        .modifyGraph('model1Relation2', (builder) => {
          builder.orderBy('id_col');
        })
        .modifyGraph('model1Relation2.model2Relation1', (builder) => {
          builder.orderBy('id');
        })
        .then((model) => {
          expect(model.toJSON()).toContainSubset({
            id: 1,
            model1Relation2: [
              {
                idCol: 1,
                model2Relation1: [],
              },
              {
                idCol: 2,
                model2Relation1: [
                  {
                    id: 5,
                    aliasedExtra: 'extra 5',
                    model1Relation1: null,
                    model1Relation2: [],
                  },
                  {
                    id: 6,
                    aliasedExtra: 'extra 6',
                    model1Relation1: {
                      id: 7,
                    },
                    model1Relation2: [
                      {
                        idCol: 3,
                      },
                    ],
                  },
                ],
              },
            ],
          });
        });
    });

    it('should merge eager expressions and modifiers', () => {
      return Model1.query()
        .where('id', 1)
        .withGraphFetched('model1Relation2')
        .withGraphFetched('model1Relation2(f1).model2Relation1.model1Relation1')
        .modifiers({
          f1: (builder) => {
            builder.orderBy('id_col');
          },
        })
        .withGraphFetched('model1Relation2.model2Relation1(f2).model1Relation2')
        .modifiers({
          f2: (builder) => {
            builder.orderBy('id');
          },
        })
        .first()
        .then((model) => {
          expect(model.toJSON()).toContainSubset({
            id: 1,
            model1Relation2: [
              {
                idCol: 1,
                model2Relation1: [],
              },
              {
                idCol: 2,
                model2Relation1: [
                  {
                    id: 5,
                    aliasedExtra: 'extra 5',
                    model1Relation1: null,
                    model1Relation2: [],
                  },
                  {
                    id: 6,
                    aliasedExtra: 'extra 6',
                    model1Relation1: {
                      id: 7,
                    },
                    model1Relation2: [
                      {
                        idCol: 3,
                      },
                    ],
                  },
                ],
              },
            ],
          });
        });
    });

    describe('mixing withGraphJoined and withGraphFetched', () => {
      const orders = [
        ['withGraphJoined', 'withGraphFetched'],
        ['withGraphFetched', 'withGraphJoined'],
      ];

      const callInOrder = (builder, order, joined, fetched) => {
        for (const method of order) {
          builder = builder[method](method === 'withGraphJoined' ? joined : fetched);
        }

        return builder;
      };

      it('should join the joined relations and fetch the fetched relations', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query()
            .where('Model1.id', 1)
            .modifyGraph('model1Relation2', (builder) => {
              builder.orderBy('id_col');
            });

          query = callInOrder(
            query,
            order,
            'model1Relation1.model1Relation1',
            'model1Relation2.model2Relation1',
          );

          return query
            .modifyGraph('model1Relation2.model2Relation1', (builder) => {
              builder.orderBy('Model1.id');
            })
            .then((models) => {
              expect(models).toHaveLength(1);

              expect(models[0].toJSON()).toContainSubset({
                id: 1,
                model1Prop1: 'hello 1',

                model1Relation1: {
                  id: 2,
                  model1Prop1: 'hello 2',

                  model1Relation1: {
                    id: 3,
                    model1Prop1: 'hello 3',
                  },
                },

                model1Relation2: [
                  {
                    idCol: 1,
                    model2Prop1: 'hejsan 1',
                    model2Relation1: [],
                  },
                  {
                    idCol: 2,
                    model2Prop1: 'hejsan 2',
                    model2Relation1: [
                      { id: 5, model1Prop1: 'hello 5', aliasedExtra: 'extra 5' },
                      { id: 6, model1Prop1: 'hello 6', aliasedExtra: 'extra 6' },
                    ],
                  },
                ],
              });

              expect(models[0]).toBeInstanceOf(Model1);
              expect(models[0].model1Relation1).toBeInstanceOf(Model1);
              expect(models[0].model1Relation2[0]).toBeInstanceOf(Model2);
              expect(models[0].model1Relation2).toHaveLength(2);
              expect(models[0].model1Relation1.model1Relation1.model1Relation1).toBeUndefined();
            });
        });
      });

      it('should filter by the joined relation while the fetched relation is complete', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query().where('model1Relation1.model1Prop1', 'hello 2');
          query = callInOrder(query, order, 'model1Relation1', 'model1Relation2');

          return query
            .modifyGraph('model1Relation2', (builder) => {
              builder.orderBy('id_col');
            })
            .then((models) => {
              expect(models).toHaveLength(1);
              expect(models[0].id).toBe(1);
              expect(models[0].model1Relation1.id).toBe(2);
              expect(models[0].model1Relation2.map((it) => it.idCol)).toEqual([1, 2]);
            });
        });
      });

      it('should filter a joined has-many relation without affecting the fetched relation', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query().where('model1Relation2.model2_prop1', 'hejsan 2');
          query = callInOrder(query, order, 'model1Relation2', 'model1Relation1.model1Relation1');

          return query.then((models) => {
            expect(models).toHaveLength(1);
            expect(models[0].id).toBe(1);
            expect(models[0].model1Relation2.map((it) => it.idCol)).toEqual([2]);
            expect(models[0].model1Relation1.id).toBe(2);
            expect(models[0].model1Relation1.model1Relation1.id).toBe(3);
          });
        });
      });

      it('should work with explicit selects that omit the identifier', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query().select('Model1.model1Prop1').where('Model1.id', 1);
          query = callInOrder(query, order, 'model1Relation1', 'model1Relation2');

          return query
            .modifyGraph('model1Relation2', (builder) => {
              builder.orderBy('id_col');
            })
            .then((models) => {
              expect(models).toHaveLength(1);
              expect(models[0].id).toBeUndefined();
              expect(models[0].model1Prop1).toBe('hello 1');
              expect(models[0].model1Relation1.id).toBe(2);
              expect(models[0].model1Relation2.map((it) => it.idCol)).toEqual([1, 2]);
            });
        });
      });

      it('should not expose internally selected columns to runAfter', () => {
        const queries = [
          {
            create: () => Model1.query().withGraphJoined('model1Relation1'),
            joined: true,
          },
          {
            create: () => Model1.query().withGraphFetched('model1Relation2'),
            fetched: true,
          },
          ...orders.map((order) => ({
            create: () => callInOrder(Model1.query(), order, 'model1Relation1', 'model1Relation2'),
            joined: true,
            fetched: true,
          })),
        ];

        return promiseMap(queries, ({ create, joined, fetched }) => {
          let runAfterModels = null;

          return create()
            .select('Model1.model1Prop1')
            .where('Model1.id', 1)
            .runAfter((models) => {
              runAfterModels = models;
              expect(models[0]).not.toHaveProperty('id');
              return models;
            })
            .then((models) => {
              expect(runAfterModels).toBe(models);
              expect(models).toHaveLength(1);
              expect(models[0]).not.toHaveProperty('id');
              expect(models[0].model1Prop1).toBe('hello 1');

              const { model1Relation1, model1Relation2 } = models[0];
              expect(model1Relation1 && model1Relation1.id).toBe(joined ? 2 : undefined);
              expect(model1Relation2 && model1Relation2.length).toBe(fetched ? 2 : undefined);
            });
        });
      });

      it('should not expose internally selected columns of fetched relations to runAfter', () => {
        const keys = [];

        return Model1.query()
          .select('Model1.model1Prop1')
          .where('Model1.id', 1)
          .withGraphFetched('model1Relation2(selectProp1).model2Relation1(selectProp1)')
          .modifiers({
            selectProp1: (builder) =>
              builder.select(builder.modelClass() === Model1 ? 'model1Prop1' : 'model2_prop1'),
          })
          .context({
            // Called for the root query and the queries of the fetched relations.
            runAfter(models, builder) {
              for (const model of models) {
                const props = Object.keys(model).sort().join(', ');
                keys.push(`${builder.modelClass().name}: ${props}`);
              }
              return models;
            },
          })
          .then(() => {
            expect(keys.sort()).toEqual([
              'Model1: model1Prop1',
              'Model1: model1Prop1',
              'Model1: model1Prop1, model1Relation2',
              'Model2: model2Prop1, model2Relation1',
              'Model2: model2Prop1, model2Relation1',
            ]);
          });
      });

      it('page should work', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query().whereNotNull('model1Relation1.id').orderBy('Model1.id');
          query = callInOrder(query, order, 'model1Relation1', 'model1Relation2');

          return query
            .modifyGraph('model1Relation2', (builder) => {
              builder.orderBy('id_col');
            })
            .page(0, 2)
            .then((res) => {
              expect(res.total).toBe(5);
              expect(res.results.map((it) => it.id)).toEqual([1, 2]);
              expect(res.results.map((it) => it.model1Relation1.id)).toEqual([2, 3]);
              expect(res.results[0].model1Relation2.map((it) => it.idCol)).toEqual([1, 2]);
              expect(res.results[1].model1Relation2).toEqual([]);
            });
        });
      });

      it('should fail if the same relation is both joined and fetched', () => {
        expect(() => {
          Model1.query()
            .withGraphJoined('model1Relation1')
            .withGraphFetched('model1Relation1.model1Relation1');
        }).toThrow(
          expect.objectContaining({
            message:
              'relation "model1Relation1" cannot be loaded with both withGraphJoined and withGraphFetched',
          }),
        );
      });

      it('withGraph() should merge nested relations into both operations', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query().where('Model1.id', 1);
          query = callInOrder(query, order, 'model1Relation1', 'model1Relation2');

          return query
            .withGraph('[model1Relation1.model1Relation1, model1Relation2.model2Relation1]')
            .modifyGraph('model1Relation2', (builder) => {
              builder.orderBy('id_col');
            })
            .modifyGraph('model1Relation2.model2Relation1', (builder) => {
              builder.orderBy('Model1.id');
            })
            .then((models) => {
              expect(models).toHaveLength(1);
              expect(models[0].model1Relation1.id).toBe(2);
              expect(models[0].model1Relation1.model1Relation1.id).toBe(3);
              expect(models[0].model1Relation2.map((it) => it.idCol)).toEqual([1, 2]);
              expect(
                models[0].model1Relation2.map((it) => it.model2Relation1.map((it) => it.id)),
              ).toEqual([[], [5, 6]]);
            });
        });
      });

      it('withGraph() should add new relations with the most recently used algorithm', () => {
        return promiseMap(orders, (order) => {
          let query = Model1.query().where('Model1.id', 1);
          query = callInOrder(query, order, 'model1Relation1', 'model1Relation2');

          // `model1Relation3` is joined or fetched, depending on the order.
          return query
            .withGraph('model1Relation3')
            .modifyGraph('model1Relation2', (builder) => {
              builder.orderBy('id_col');
            })
            .then((models) => {
              expect(models).toHaveLength(1);
              expect(models[0].model1Relation1.id).toBe(2);
              expect(models[0].model1Relation2.map((it) => it.idCol)).toEqual([1, 2]);
              expect(models[0].model1Relation3).toBeInstanceOf(Array);
            });
        });
      });

      it('isJoinChildQuery() should tell the child queries of both algorithms apart', () => {
        return promiseMap(orders, (order) => {
          const childQueries = [];
          let query = Model1.query()
            .where('Model1.id', 1)
            .modifiers({
              capture: (builder) => {
                childQueries.push([builder.modelClass().name, builder.isJoinChildQuery()]);
              },
            });

          query = callInOrder(query, order, 'model1Relation1(capture)', 'model1Relation2(capture)');

          return query.then(() => {
            expect(sortBy(childQueries, ([name]) => name)).toEqual([
              ['Model1', true],
              ['Model2', false],
            ]);
          });
        });
      });
    });

    describe('QueryBuilder.orderBy', () => {
      it('orderBy should work for the root query', () => {
        return promiseMap(['withGraphFetched', 'withGraphJoined'], (method) => {
          return Model1.query()
            .select('Model1.model1Prop1')
            .modifyGraph('model1Relation1', (builder) => {
              builder.select('model1Prop1');
            })
            [method]('model1Relation1')
            .orderBy('Model1.model1Prop1', 'DESC')
            .whereNotNull('Model1.model1Id')
            .then((models) => {
              expect(models).toEqual([
                {
                  model1Prop1: 'hello 8',
                  model1Relation1: { model1Prop1: 'hello 9', $afterFindCalled: 1 },
                  $afterFindCalled: 1,
                },
                {
                  model1Prop1: 'hello 6',
                  model1Relation1: { model1Prop1: 'hello 7', $afterFindCalled: 1 },
                  $afterFindCalled: 1,
                },
                {
                  model1Prop1: 'hello 3',
                  model1Relation1: { model1Prop1: 'hello 4', $afterFindCalled: 1 },
                  $afterFindCalled: 1,
                },
                {
                  model1Prop1: 'hello 2',
                  model1Relation1: { model1Prop1: 'hello 3', $afterFindCalled: 1 },
                  $afterFindCalled: 1,
                },
                {
                  model1Prop1: 'hello 1',
                  model1Relation1: { model1Prop1: 'hello 2', $afterFindCalled: 1 },
                  $afterFindCalled: 1,
                },
              ]);
            });
        });
      });
    });

    describe('Multiple parents + ManyToManyRelation', () => {
      beforeEach(() => {
        return Model2.query().insertGraph([
          {
            idCol: 100,
            model2Prop1: 'hejsan 1',

            model2Relation1: [
              {
                id: 500,
                model1Prop1: 'hello 5',
              },
              {
                id: 600,
                model1Prop1: 'hello 6',
              },
            ],
          },
          {
            idCol: 200,
            model2Prop1: 'hejsan 2',

            model2Relation1: [
              {
                id: 700,
                model1Prop1: 'hello 7',
              },
              {
                id: 800,
                model1Prop1: 'hello 8',
              },
            ],
          },
        ]);
      });

      it('should work with withGraphFetched', () => {
        return Model2.query()
          .whereIn('id_col', [100, 200])
          .orderBy('id_col')
          .withGraphFetched('model2Relation1(select, orderById)')
          .modifiers({
            select: (b) => b.select('model1Prop1'),
          })
          .then((models) => {
            expect(models).toEqual([
              {
                idCol: 100,
                model1Id: null,
                model2Prop1: 'hejsan 1',
                model2Prop2: null,
                $afterFindCalled: 1,
                model2Relation1: [
                  {
                    model1Prop1: 'hello 5',
                    $afterFindCalled: 1,
                  },
                  {
                    model1Prop1: 'hello 6',
                    $afterFindCalled: 1,
                  },
                ],
              },
              {
                idCol: 200,
                model1Id: null,
                model2Prop1: 'hejsan 2',
                model2Prop2: null,
                $afterFindCalled: 1,
                model2Relation1: [
                  {
                    model1Prop1: 'hello 7',
                    $afterFindCalled: 1,
                  },
                  {
                    model1Prop1: 'hello 8',
                    $afterFindCalled: 1,
                  },
                ],
              },
            ]);
          });
      });

      it('should work with withGraphJoined', () => {
        return Model2.query()
          .whereIn('id_col', [100, 200])
          .orderBy(['id_col', 'model2Relation1.model1Prop1'])
          .modifiers({
            select: (b) => b.select('model1Prop1'),
          })
          .withGraphJoined('model2Relation1(select)')
          .then((models) => {
            expect(models).toEqual([
              {
                idCol: 100,
                model1Id: null,
                model2Prop1: 'hejsan 1',
                model2Prop2: null,
                $afterFindCalled: 1,
                model2Relation1: [
                  {
                    model1Prop1: 'hello 5',
                    $afterFindCalled: 1,
                  },
                  {
                    model1Prop1: 'hello 6',
                    $afterFindCalled: 1,
                  },
                ],
              },
              {
                idCol: 200,
                model1Id: null,
                model2Prop1: 'hejsan 2',
                model2Prop2: null,
                $afterFindCalled: 1,
                model2Relation1: [
                  {
                    model1Prop1: 'hello 7',
                    $afterFindCalled: 1,
                  },
                  {
                    model1Prop1: 'hello 8',
                    $afterFindCalled: 1,
                  },
                ],
              },
            ]);
          });
      });
    });

    describe('Same ManyToMany child for multiple parents + extras', () => {
      beforeEach(() => {
        return Model2.query().insertGraph(
          [
            {
              idCol: 100,
              model2Prop1: 'hejsan 1',

              model2Relation1: [
                {
                  id: 500,
                  model1Prop1: 'hello 5',
                },
                {
                  '#id': 'shared',
                  id: 600,
                  model1Prop1: 'hello 6',
                  aliasedExtra: 'lol1',
                },
              ],
            },
            {
              idCol: 200,
              model2Prop1: 'hejsan 2',

              model2Relation1: [
                {
                  '#ref': 'shared',
                  aliasedExtra: 'lol2',
                },
                {
                  id: 700,
                  model1Prop1: 'hello 7',
                },
              ],
            },
          ],
          { allowRefs: true },
        );
      });

      it('test', () => {
        return Model2.query()
          .whereIn('id_col', [100, 200])
          .orderBy('id_col')
          .withGraphFetched('model2Relation1(orderById)')
          .then((result) => {
            expect(result).toContainSubset([
              {
                idCol: 100,

                model2Relation1: [
                  {
                    id: 500,
                    aliasedExtra: null,
                  },
                  {
                    id: 600,
                    aliasedExtra: 'lol1',
                  },
                ],
              },
              {
                idCol: 200,

                model2Relation1: [
                  {
                    id: 600,
                    aliasedExtra: 'lol2',
                  },
                  {
                    id: 700,
                    aliasedExtra: null,
                  },
                ],
              },
            ]);
          });
      });
    });

    describe('aliases', () => {
      it('aliases in eager expressions should work', () => {
        return promiseMap(
          ['withGraphFetched', 'withGraphJoined'],
          (method) => {
            return Model1.query()
              .where('Model1.id', 1)
              .select('Model1.id')
              [method](
                `[
              model1Relation1(f1) as a,
              model1Relation2(f2) as b .[
                model2Relation1(f1) as c,
                model2Relation1(f1) as d
              ]
            ]`,
              )
              .modifiers({
                f1: (builder) => builder.select('Model1.id'),
                f2: (builder) => builder.select('model2.id_col'),
              })
              .first()
              .then((model) => {
                model.b = sortBy(model.b, 'idCol');
                model.b[1].c = sortBy(model.b[1].c, 'id');
                model.b[1].d = sortBy(model.b[1].d, 'id');

                expect(model).toEqual({
                  id: 1,
                  $afterFindCalled: 1,

                  a: {
                    id: 2,
                    $afterFindCalled: 1,
                  },

                  b: [
                    {
                      idCol: 1,
                      $afterFindCalled: 1,

                      c: [],
                      d: [],
                    },
                    {
                      idCol: 2,
                      $afterFindCalled: 1,

                      c: [
                        {
                          id: 5,
                          $afterFindCalled: 1,
                        },
                        {
                          id: 6,
                          $afterFindCalled: 1,
                        },
                      ],

                      d: [
                        {
                          id: 5,
                          $afterFindCalled: 1,
                        },
                        {
                          id: 6,
                          $afterFindCalled: 1,
                        },
                      ],
                    },
                  ],
                });
              });
          },
          { concurrency: 1 },
        );
      });

      it('aliases should alias the joined tables when using withGraphJoined', () => {
        return Model1.query()
          .findById(1)
          .select('Model1.id')
          .withGraphJoined(
            `[
            model1Relation1(f1) as a,
            model1Relation2(f2) as b .[
              model2Relation1(f1) as c,
              model2Relation1(f1) as d
            ]
          ]`,
          )
          .modifiers({
            f1: (builder) => builder.select('Model1.id'),
            f2: (builder) => builder.select('model2.id_col'),
          })
          .where('b:d.id', 6)
          .then((model) => {
            model.b = sortBy(model.b, 'idCol');
            model.b[0].c = sortBy(model.b[0].c, 'id');
            model.b[0].d = sortBy(model.b[0].d, 'id');

            expect(model).toEqual({
              id: 1,
              $afterFindCalled: 1,

              a: {
                id: 2,
                $afterFindCalled: 1,
              },

              b: [
                {
                  idCol: 2,
                  $afterFindCalled: 1,

                  c: [
                    {
                      id: 5,
                      $afterFindCalled: 1,
                    },
                    {
                      id: 6,
                      $afterFindCalled: 1,
                    },
                  ],

                  d: [
                    {
                      id: 6,
                      $afterFindCalled: 1,
                    },
                  ],
                },
              ],
            });
          });
      });

      it('alias method should work', () => {
        return promiseMap(
          ['withGraphFetched', 'withGraphJoined'],
          (method) => {
            return Model1.query()
              .alias('m1')
              .select('m1.id')
              [method](`[model1Relation1(f1) as a]`)
              .modifiers({
                f1: (builder) => builder.select('id'),
              })
              .findOne({ 'm1.id': 1 })
              .then((model) => {
                expect(model).toEqual({
                  id: 1,
                  $afterFindCalled: 1,

                  a: {
                    id: 2,
                    $afterFindCalled: 1,
                  },
                });
              });
          },
          { concurrency: 1 },
        );
      });
    });

    if (session.isPostgres()) {
      describe('generated sql', () => {
        let sql = [];
        let mockKnex = null;

        beforeAll(() => {
          mockKnex = mockKnexFactory(session.knex, function (mock, then, args) {
            sql.push(this.toString());
            return then.apply(this, args);
          });
        });

        beforeEach(() => {
          sql = [];
        });

        it('check withGraphFetched generated SQL', () => {
          return Model1.bindKnex(mockKnex)
            .query()
            .withGraphFetched(
              '[model1Relation1, model1Relation1Inverse, model1Relation2.[model2Relation1, model2Relation2], model1Relation3]',
            )
            .context({
              onBuild(builder) {
                if (builder.modelClass().name === 'Model2') {
                  builder.orderBy('id_col');
                } else {
                  builder.orderBy('id');
                }
              },
            })
            .then(() => {
              expect(sql).toEqual([
                'select "Model1".* from "Model1" order by "id" asc',
                'select "Model1".* from "Model1" where "Model1"."id" in (2, 3, 4, 7, 9) order by "id" asc',
                'select "Model1".* from "Model1" where "Model1"."model1Id" in (1, 2, 3, 4, 5, 6, 7, 8, 9) order by "id" asc',
                'select "model2".* from "model2" where "model2"."model1_id" in (1, 2, 3, 4, 5, 6, 7, 8, 9) order by "id_col" asc',
                'select "model2".*, "Model1Model2"."extra1" as "extra1", "Model1Model2"."extra2" as "extra2", "Model1Model2"."model1Id" as "objectiontmpjoin0" from "model2" inner join "Model1Model2" on "model2"."id_col" = "Model1Model2"."model2Id" where "Model1Model2"."model1Id" in (1, 2, 3, 4, 5, 6, 7, 8, 9) order by "id_col" asc',
                'select "Model1".*, "Model1Model2"."extra3" as "aliasedExtra", "Model1Model2"."model2Id" as "objectiontmpjoin0" from "Model1" inner join "Model1Model2" on "Model1"."id" = "Model1Model2"."model1Id" where "Model1Model2"."model2Id" in (1, 2, 3, 4) order by "id" asc',
                'select "Model1".*, "Model1Model2One"."model2Id" as "objectiontmpjoin0" from "Model1" inner join "Model1Model2One" on "Model1"."id" = "Model1Model2One"."model1Id" where "Model1Model2One"."model2Id" in (1, 2, 3, 4) order by "id" asc',
              ]);
            });
        });

        it('should not execute queries when an empty relation set is encoutered', () => {
          return Model1.bindKnex(mockKnex)
            .query()
            .findById(4)
            .withGraphFetched('model1Relation1')
            .then((res) => {
              expect(sql).toHaveLength(1);
              expect(res.id).toBe(4);
            });
        });

        it('check withGraphJoined generated SQL', () => {
          return Model1.bindKnex(mockKnex)
            .query()
            .withGraphJoined(
              '[model1Relation1, model1Relation1Inverse, model1Relation2.[model2Relation1, model2Relation2], model1Relation3]',
            )
            .then(() => {
              expect(sql[sql.length - 1].replace(/\s/g, '')).toBe(
                `
                select
                  "Model1"."id" as "id",
                  "Model1"."model1Id" as "model1Id",
                  "Model1"."model1Prop1" as "model1Prop1",
                  "Model1"."model1Prop2" as "model1Prop2",
                  "model1Relation1"."id" as "model1Relation1:id",
                  "model1Relation1"."model1Id" as "model1Relation1:model1Id",
                  "model1Relation1"."model1Prop1" as "model1Relation1:model1Prop1",
                  "model1Relation1"."model1Prop2" as "model1Relation1:model1Prop2",
                  "model1Relation1Inverse"."id" as "model1Relation1Inverse:id",
                  "model1Relation1Inverse"."model1Id" as "model1Relation1Inverse:model1Id",
                  "model1Relation1Inverse"."model1Prop1" as "model1Relation1Inverse:model1Prop1",
                  "model1Relation1Inverse"."model1Prop2" as "model1Relation1Inverse:model1Prop2",
                  "model1Relation2"."id_col" as "model1Relation2:id_col",
                  "model1Relation2"."model1_id" as "model1Relation2:model1_id",
                  "model1Relation2"."model2_prop1" as "model1Relation2:model2_prop1",
                  "model1Relation2"."model2_prop2" as "model1Relation2:model2_prop2",
                  "model1Relation2:model2Relation1"."id" as "model1Relation2:model2Relation1:id",
                  "model1Relation2:model2Relation1"."model1Id" as "model1Relation2:model2Relation1:model1Id",
                  "model1Relation2:model2Relation1"."model1Prop1" as "model1Relation2:model2Relation1:model1Prop1",
                  "model1Relation2:model2Relation1"."model1Prop2" as "model1Relation2:model2Relation1:model1Prop2",
                  "model1Relation2:model2Relation1_join"."extra3" as "model1Relation2:model2Relation1:aliasedExtra",
                  "model1Relation2:model2Relation2"."id" as "model1Relation2:model2Relation2:id",
                  "model1Relation2:model2Relation2"."model1Id" as "model1Relation2:model2Relation2:model1Id",
                  "model1Relation2:model2Relation2"."model1Prop1" as "model1Relation2:model2Relation2:model1Prop1",
                  "model1Relation2:model2Relation2"."model1Prop2" as "model1Relation2:model2Relation2:model1Prop2",
                  "model1Relation3"."id_col" as "model1Relation3:id_col",
                  "model1Relation3"."model1_id" as "model1Relation3:model1_id",
                  "model1Relation3"."model2_prop1" as "model1Relation3:model2_prop1",
                  "model1Relation3"."model2_prop2" as "model1Relation3:model2_prop2",
                  "model1Relation3_join"."extra1" as "model1Relation3:extra1",
                  "model1Relation3_join"."extra2" as "model1Relation3:extra2"
                from
                  "Model1"
                left join
                  "Model1" as "model1Relation1" on "model1Relation1"."id" = "Model1"."model1Id"
                left join
                  "Model1" as "model1Relation1Inverse" on "model1Relation1Inverse"."model1Id" = "Model1"."id"
                left join
                  "model2" as "model1Relation2" on "model1Relation2"."model1_id" = "Model1"."id"
                left join
                  "Model1Model2" as "model1Relation2:model2Relation1_join" on "model1Relation2:model2Relation1_join"."model2Id" = "model1Relation2"."id_col"
                left join
                  "Model1" as "model1Relation2:model2Relation1" on "model1Relation2:model2Relation1_join"."model1Id" = "model1Relation2:model2Relation1"."id"
                left join
                  "Model1Model2One" as "model1Relation2:model2Relation2_join" on "model1Relation2:model2Relation2_join"."model2Id" = "model1Relation2"."id_col"
                left join
                  "Model1" as "model1Relation2:model2Relation2" on "model1Relation2:model2Relation2_join"."model1Id" = "model1Relation2:model2Relation2"."id"
                left join
                  "Model1Model2" as "model1Relation3_join" on "model1Relation3_join"."model1Id" = "Model1"."id"
                left join
                  "model2" as "model1Relation3" on "model1Relation3_join"."model2Id" = "model1Relation3"."id_col"
              `.replace(/\s/g, ''),
              );
            });
        });
      });
    }

    if (session.isPostgres())
      describe.skip('big data', () => {
        let graph = null;

        beforeAll(() => {
          let n = 0;

          graph = range(100).map(() => {
            return {
              model1Prop1: 'hello ' + n++,

              model1Relation1: {
                model1Prop1: 'hi ' + n++,

                model1Relation1: {
                  model1Prop1: 'howdy ' + n++,
                },
              },

              model1Relation1Inverse: {
                model1Prop1: 'quux ' + n++,
              },

              model1Relation2: range(10).map(() => {
                return {
                  model2Prop1: 'foo ' + n++,

                  model2Relation1: range(10).map(() => {
                    return {
                      model1Prop1: 'bar ' + n++,
                    };
                  }),

                  model2Relation2: {
                    model1Prop1: 'baz ' + n++,
                  },
                };
              }),

              model1Relation3: range(10).map(() => {
                return {
                  model2Prop1: 'spam ' + n++,
                };
              }),
            };
          });

          return session
            .populate([])
            .then(() => {
              return Model1.query().insertGraph(graph);
            })
            .then((inserted) => {
              graph = inserted;
            });
        }, 30000);

        it('should work with a lot of data', () => {
          return promiseMap(
            ['withGraphFecthed', 'withGraphJoined'],
            (method) => {
              let t1 = Date.now();
              return Model1.query()
                .where('Model1.model1Prop1', 'like', 'hello%')
                [method](
                  '[model1Relation1.model1Relation1, model1Relation1Inverse, model1Relation2.[model2Relation1, model2Relation2], model1Relation3]',
                )
                .then((res) => {
                  console.log('query time', Date.now() - t1);

                  graph = sortBy(graph, 'id');
                  res = sortBy(res, 'id');

                  Model1.traverse(graph, traverser);
                  Model1.traverse(res, traverser);

                  let expected = graph.map((it) => it.toJSON());
                  let got = res.map((it) => it.toJSON());

                  expect(got).toEqual(expected);
                });
            },
            { concurrency: 1 },
          );
        }, 30000);

        function traverser(model) {
          ['extra1', 'extra2', 'aliasedExtra', 'model1Id', 'model1Prop2', 'model2Prop2'].forEach(
            (key) => {
              delete model[key];
            },
          );

          ['model1Relation2', 'model1Relation3'].map((rel) => {
            if (model[rel]) {
              model[rel] = sortBy(model[rel], 'idCol');
            }
          });

          ['model2Relation1'].map((rel) => {
            if (model[rel]) {
              model[rel] = sortBy(model[rel], 'id');
            }
          });
        }
      });
  });

  // Tests all ways to fetch eagerly.
  function test(expr, tester, opt) {
    let testName;

    if (typeof expr === 'object') {
      testName = JSON.stringify(expr);
    } else {
      testName = expr.replace(/\s/g, '');
    }

    opt = {
      Model: Model1,
      filters: {},
      id: 1,
      ...opt,
    };

    let idCol = opt.Model.query().fullIdColumnFor(opt.Model);
    let testFn = opt.only ? it.only : it;

    if (!opt.disableWhereIn) {
      testFn(testName + ' (QueryBuilder.withGraphFetched)', () => {
        return opt.Model.query()
          .where(idCol, opt.id)
          .withGraphFetched(expr)
          .modifiers(opt.filters)
          .then(sortRelations(opt.disableSort))
          .then(tester);
      });

      testFn(testName + ' (Model.$fetchGraph)', () => {
        return opt.Model.query()
          .where(idCol, opt.id)
          .then((models) => {
            return models[0].$fetchGraph(expr).modifiers(opt.filters);
          })
          .then(sortRelations(opt.disableSort))
          .then((result) => {
            tester([result]);
          });
      });
    }

    if (!opt.disableJoin) {
      testFn(testName + ' (QueryBuilder.withGraphJoined)', () => {
        return opt.Model.query()
          .where(idCol, opt.id)
          .withGraphJoined(expr, opt.eagerOptions)
          .modifiers(opt.filters)
          .then(sortRelations(opt.disableSort))
          .then(tester);
      });
    }
  }

  function sortRelations(disable) {
    if (disable) {
      return (models) => {
        return models;
      };
    }

    return (models) => {
      Model1.traverse(models, (model) => {
        if (model.model1Relation2) {
          model.model1Relation2 = sortBy(model.model1Relation2, ['idCol', 'model2Prop1']);
        }

        if (model.model2Relation1) {
          model.model2Relation1 = sortBy(model.model2Relation1, ['id', 'model1Prop1']);
        }
      });

      return models;
    };
  }
};
