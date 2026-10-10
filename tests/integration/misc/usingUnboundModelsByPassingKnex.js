import { describe, it, expect, beforeEach } from 'vitest';
import { createRejectionReflection, sortBy } from '../../../testUtils/testUtils.js';
import { try as promiseTry } from '../../../lib/utils/promiseUtils/index.js';

export default (session) => {
  describe('using unbound models by passing a knex to query', () => {
    let Model1 = session.unboundModels.Model1;
    let Model2 = session.unboundModels.Model2;

    beforeEach(() => {
      // This tests insertGraph.
      return session.populate([]).then(() => {
        return Model1.query(session.knex).insertGraph([
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
    });

    it('basic wheres', () => {
      const query = Model1.query().orWhereNot('id', '>', 10).whereIn('id', [1, 8, 11]);

      return query.knex(session.knex).then((models) => {
        expect(models[0].model1Prop1).toBe('hello 1');
      });
    });

    it('findById', () => {
      const query = Model1.query().findById(1);

      return query.knex(session.knex).then((model) => {
        expect(model.model1Prop1).toBe('hello 1');
      });
    });

    it('findById composite', () => {
      class TestModel extends Model1 {
        static get idColumn() {
          return ['id', 'model1Prop1'];
        }
      }

      const query = TestModel.query().findById([1, 'hello 1']);

      return query.knex(session.knex).then((model) => {
        expect(model.model1Prop1).toBe('hello 1');
      });
    });

    it('eager', () => {
      return Promise.all([
        // Give connection after building the query.
        Model1.query()
          .findById(1)
          .withGraphJoined(
            '[model1Relation1, model1Relation2.model2Relation1.[model1Relation1, model1Relation2]]',
          )
          .knex(session.knex),

        Model1.query(session.knex)
          .findById(1)
          .withGraphFetched(
            '[model1Relation1, model1Relation2.model2Relation1.[model1Relation1, model1Relation2]]',
          ),

        Model1.query(session.knex)
          .findById(1)
          .withGraphJoined(
            '[model1Relation1, model1Relation2.model2Relation1.[model1Relation1, model1Relation2]]',
          ),
      ]).then((results) => {
        results.forEach((models) => {
          expect(sortRelations(models)).toEqual({
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
          });
        });
      });
    });

    describe('subqueries', () => {
      it('basic', () => {
        const query = Model1.query().whereIn('id', Model1.query().select('id').where('id', 5));

        return query.knex(session.knex).then((models) => {
          expect(models[0].model1Prop1).toBe('hello 5');
        });
      });

      it('joinRelated in subquery', () => {
        const query = Model1.query().whereIn(
          'id',
          Model1.query()
            .select('Model1.id')
            .joinRelated('model1Relation1')
            .where('model1Relation1.id', 4),
        );

        return query.knex(session.knex).then((models) => {
          expect(models[0].id).toBe(3);
        });
      });

      it('static relatedQuery', () => {
        const query = Model1.query()
          .findById(1)
          .select('Model1.*', Model1.relatedQuery('model1Relation2').count().as('count'));

        return query.knex(session.knex).then((model) => {
          expect(Number(model.count)).toBe(2);
        });
      });
    });

    describe('$relatedQuery', () => {
      it('fetch', () => {
        return Promise.all([
          Model1.query(session.knex)
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation1', session.knex);
            }),

          Model1.query(session.knex)
            .findById(2)
            .then((model) => {
              return model.$relatedQuery('model1Relation1Inverse', session.knex);
            }),

          Model1.query(session.knex)
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation2', session.knex);
            }),

          Model2.query(session.knex)
            .findById(2)
            .then((model) => {
              return model.$relatedQuery('model2Relation1', session.knex);
            }),
        ]).then((results) => {
          expect(results[0]).toEqual({
            id: 2,
            model1Id: 3,
            model1Prop1: 'hello 2',
            model1Prop2: null,
            $afterFindCalled: 1,
          });

          expect(results[1]).toEqual({
            id: 1,
            model1Id: 2,
            model1Prop1: 'hello 1',
            model1Prop2: null,
            $afterFindCalled: 1,
          });

          expect(sortBy(results[2], 'idCol')).toEqual([
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
          ]);

          expect(sortBy(results[3], 'id')).toEqual([
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
          ]);
        });
      });
    });

    describe('$query', () => {
      it('fetch', () => {
        return Promise.all([
          Model1.query(session.knex)
            .findById(1)
            .then((model) => {
              return model.$query(session.knex);
            }),
        ]).then((model) => {
          expect(model).toEqual([
            {
              id: 1,
              model1Id: 2,
              model1Prop1: 'hello 1',
              model1Prop2: null,
              $afterFindCalled: 1,
            },
          ]);
        });
      });

      it('insert', () => {
        return Model1.fromJson({ model1Prop1: 'foo', id: 100 })
          .$query(session.knex)
          .insert()
          .then((model) => {
            expect(model).toEqual({
              id: 100,
              model1Prop1: 'foo',
              $afterInsertCalled: 1,
              $beforeInsertCalled: 1,
            });
          });
      });

      it('insertAndFetch', () => {
        return Model1.fromJson({ model1Prop1: 'foo', id: 101 })
          .$query(session.knex)
          .insertAndFetch()
          .then((model) => {
            expect(model).toEqual({
              id: 101,
              model1Id: null,
              model1Prop1: 'foo',
              model1Prop2: null,
              $afterInsertCalled: 1,
              $beforeInsertCalled: 1,
            });
          });
      });
    });

    it('joinRelated (BelongsToOneRelation)', () => {
      return Model1.query(session.knex)
        .select('Model1.id as id', 'model1Relation1.id as relId')
        .innerJoinRelated('model1Relation1')
        .then((models) => {
          expect(sortBy(models, 'id')).toEqual([
            { id: 1, relId: 2, $afterFindCalled: 1 },
            { id: 2, relId: 3, $afterFindCalled: 1 },
            { id: 3, relId: 4, $afterFindCalled: 1 },
            { id: 6, relId: 7, $afterFindCalled: 1 },
          ]);
        });
    });

    it('joinRelated (ManyToManyRelation)', () => {
      return Model1.query(session.knex)
        .select('Model1.id as id', 'model1Relation3.id_col as relId')
        .innerJoinRelated('model1Relation3')
        .then((models) => {
          expect(sortBy(models, 'id')).toEqual([
            { id: 5, relId: 2, $afterFindCalled: 1 },
            { id: 6, relId: 2, $afterFindCalled: 1 },
          ]);
        });
    });

    it('should fail with a descriptive error message if knex is not provided', () => {
      return Promise.all([
        promiseTry(() => {
          return Model1.query()
            .findById(1)
            .withGraphFetched(
              '[model1Relation1, model1Relation2.model2Relation1.[model1Relation1, model1Relation2]]',
            );
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query()
            .findById(1)
            .withGraphJoined(
              '[model1Relation1, model1Relation2.model2Relation1.[model1Relation1, model1Relation2]]',
            );
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query();
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query().where('id', 1);
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query().joinRelated('model1Relation1');
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query(session.knex)
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation1');
            });
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query(session.knex)
            .findById(2)
            .then((model) => {
              return model.$relatedQuery('model1Relation1Inverse');
            });
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query(session.knex)
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation2');
            });
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model2.query(session.knex)
            .findById(2)
            .then((model) => {
              return model.$relatedQuery('model2Relation1');
            });
        }).catch((err) => createRejectionReflection(err)),

        promiseTry(() => {
          return Model1.query(session.knex)
            .findById(1)
            .then((model) => {
              return model.$query();
            });
        }).catch((err) => createRejectionReflection(err)),
      ]).then((results) => {
        results.forEach((result) => {
          expect(result.isRejected()).toBe(true);
          expect(result.reason().message).toMatch(
            /no database connection available for a query. You need to bind the model class or the query to a knex instance./,
          );
        });
      });
    });

    function sortRelations(models) {
      Model1.traverse(models, (model) => {
        if (model.model1Relation2) {
          model.model1Relation2 = sortBy(model.model1Relation2, 'idCol');
        }

        if (model.model2Relation1) {
          model.model2Relation1 = sortBy(model.model2Relation1, 'id');
        }
      });

      return models;
    }
  });
};
