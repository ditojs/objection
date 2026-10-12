import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as utils from '../../lib/utils/knexUtils.js';
import { transaction, ValidationError, Model } from 'objection';
import { cloneDeep, delay, range, sortBy } from '../../testUtils/testUtils.js';

export default (session) => {
  let Model1 = session.models.Model1;
  let Model2 = session.models.Model2;

  describe('Model insertGraph queries', () => {
    const eagerExpr = `[
      model1Relation1.model1Relation3,
      model1Relation1Inverse,
      model1Relation2.model2Relation2
    ]`;

    let population;
    let insertion;

    beforeEach(() => {
      population = {
        id: 1,
        model1Prop1: '20',
        model1Relation3: [
          {
            idCol: 1,
          },
        ],
      };

      insertion = {
        model1Prop1: 'root',

        model1Relation1: {
          model1Prop1: 'parent',
          model1Prop2: '#ref{grandChild.idCol}',

          model1Relation3: [
            {
              '#ref': 'child1',
            },
            {
              '#id': 'grandChild',
              model2Prop1: 'cibling2',
              // These should go to the join table.
              extra1: 'extraVal1',
              extra2: 'extraVal2',
            },
            {
              '#dbRef': 1,
              extra1: 'foo',
            },
          ],
        },

        model1Relation1Inverse: {
          model1Prop1: 'rootParent',
        },

        model1Relation2: [
          {
            '#id': 'child1',
            model2Prop1: 'child1',
          },
          {
            model2Prop1: 'child2',

            model2Relation2: {
              model1Prop1: 'child3',
            },
          },
        ],
      };
    });

    describe('.query().insertGraph()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should do nothing if an empty array is provided', () => {
        return Model1.query().insertGraph([]);
      });

      it('should throw if #ref is used without the `allowRefs` option', () => {
        return Model1.query()
          .insertGraph({
            '#id': 'id1',

            model1Relation2: [
              {
                '#ref': 'id1',
              },
            ],
          })
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err.message).toBe(
              '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
            );
          });
      });

      it('should throw if #ref{} is used without the `allowRefs` option', () => {
        return Model1.query()
          .insertGraph({
            '#id': 'id1',

            model1Relation2: [
              {
                model1Prop1: '#ref{id1.id}',
              },
            ],
          })
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err.message).toBe(
              '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
            );
          });
      });

      it('should insert a model with relations', () => {
        return Model1.query()
          .insertGraph(insertion, { allowRefs: true })
          .then((inserted) => {
            return check(inserted, true).then(() => inserted);
          })
          .then((inserted) => {
            expect(inserted).not.toHaveProperty('model1Prop2');
            return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
          })
          .then((model) => {
            return check(model);
          });
      });

      it('should not return the reference markers (#221)', async () => {
        const inserted = await Model1.query().insertGraph(insertion, { allowRefs: true });
        const [ref, , dbRef] = inserted.model1Relation1.model1Relation3;

        expect(ref).not.toHaveProperty('#ref');
        expect(ref.model2Prop1).toBe('child1');
        expect(dbRef).not.toHaveProperty('#dbRef');
        expect(dbRef.idCol).toBe(1);
      });

      it('should not return the reference markers of skipped models (#221)', async () => {
        const inserted = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',
            model1Relation1: { model1Prop1: 'skipped', model1Relation3: [{ '#dbRef': 1 }] },
          },
          { allowRefs: true, noInsert: ['model1Relation1'] },
        );

        expect(inserted.model1Relation1.model1Relation3[0]).not.toHaveProperty('#dbRef');
      });

      it('should not return the reference markers below related models (#221)', async () => {
        const inserted = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',
            model1Relation1: { '#dbRef': 1, model1Relation3: [{ '#dbRef': 1 }] },
          },
          { allowRefs: true },
        );

        expect(inserted.model1Relation1).not.toHaveProperty('#dbRef');
        expect(inserted.model1Relation1.model1Relation3[0]).not.toHaveProperty('#dbRef');
      });

      describe('jsonSchema: additionalProperties = false', () => {
        let origSchema;

        beforeAll(() => {
          origSchema = Model1.jsonSchema;

          Model1.jsonSchema = {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'number' },
              model1Prop1: { type: 'string' },
              model1Prop2: { type: 'number' },
              model1Id: { type: 'number' },
            },
          };

          // Clear the memoized schema.
          delete Model1.$$jsonSchema;
          expect(Model1.getJsonSchema()).toBe(Model1.jsonSchema);
        });

        afterAll(() => {
          Model1.jsonSchema = origSchema;

          // Clear the memoized schema.
          delete Model1.$$jsonSchema;
          expect(Model1.getJsonSchema()).toBe(origSchema);
        });

        it('should insert a model with relations', () => {
          return Model1.query()
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted, true).then(() => inserted);
            })
            .then((inserted) => {
              expect(inserted).not.toHaveProperty('model1Prop2');
              return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      });

      it('should accept raw sql and subqueries', () => {
        return Model1.query()
          .insertGraph([
            {
              model1Prop1: '10',
            },
            {
              model1Prop1: '50',
            },
          ])
          .then(() => {
            return Model1.query().insertGraph({
              model1Prop1: Model1.raw('40 + 2'),

              model1Relation2: [
                {
                  '#id': 'child1',
                  idCol: 100,
                  model2Prop1: Model1.query().min('model1Prop1'),
                },
                {
                  idCol: 101,
                  model2Prop1: Model1.knex().from('Model1').max('model1Prop1'),
                },
              ],
            });
          })
          .then((inserted) => {
            inserted.model1Relation2 = sortBy(inserted.model1Relation2, 'idCol');

            expect(inserted.toJSON()).toEqual({
              id: 4,
              model1Relation2: [
                { model1Id: 4, idCol: 100 },
                { model1Id: 4, idCol: 101 },
              ],
            });

            return Model1.query().withGraphFetched('model1Relation2').where('id', inserted.id);
          })
          .then((inserted) => {
            inserted[0].model1Relation2 = sortBy(inserted[0].model1Relation2, 'idCol');

            expect(inserted[0]).toEqual({
              id: 4,
              model1Id: null,
              model1Prop1: '42',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation2: [
                {
                  idCol: 100,
                  model1Id: 4,
                  model2Prop1: '10',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
                {
                  idCol: 101,
                  model1Id: 4,
                  model2Prop1: '50',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });

      const testValidation = (modifyGraph, expectedProperty) => {
        return () => {
          const graph = cloneDeep(insertion);
          modifyGraph(graph);

          return transaction(Model1, Model2, (Model1, Model2) => {
            // We can modify Model1 and Model2 here since it is a subclass of the actual
            // models shared between tests.
            Model1.jsonSchema = {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                model1Id: { type: 'integer' },
                model1Prop1: { type: 'string' },
                model1Prop2: { type: 'integer' },
              },
            };

            Model2.jsonSchema = {
              type: 'object',
              properties: {
                idCol: { type: 'integer' },
                model1Id: { type: 'integer' },
                model2Prop1: { type: 'string' },
                model2Prop2: { type: 'integer' },
              },
            };

            delete Model1.$$jsonSchema;
            delete Model2.$$jsonSchema;

            expect(Model1.getJsonSchema()).toBe(Model1.jsonSchema);
            expect(Model2.getJsonSchema()).toBe(Model2.jsonSchema);

            return Model1.query().insertGraph(graph, { allowRefs: true });
          })
            .then(() => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err).toBeInstanceOf(ValidationError);
              expect(err.data).toHaveProperty([expectedProperty]);

              return Promise.all([session.knex('Model1'), session.knex('model2')]);
            })
            .then(([rows1, rows2]) => {
              expect(rows1).toHaveLength(1);
              expect(rows2).toHaveLength(1);
            });
        };
      };

      it(
        'should validate models upon insertion and return correct validation paths',
        testValidation((graph) => {
          graph.model1Relation1.model1Prop1 = 666;
        }, 'model1Relation1.model1Prop1'),
      );

      it(
        'should return correct validation paths with has-many relations',
        testValidation((graph) => {
          graph.model1Relation2[0].model2Prop1 = 666;
        }, 'model1Relation2[0].model2Prop1'),
      );

      it(
        'should return correct validation paths with many-to-many relations',
        testValidation((graph) => {
          graph.model1Relation1.model1Relation3[1].model2Prop1 = 666;
        }, 'model1Relation1.model1Relation3[1].model2Prop1'),
      );

      it('should roll back after the inserts that already started when a model fails validation', async () => {
        let numStarted = 0;
        let numInserted = 0;

        class ValidatedModel1 extends Model1 {
          static jsonSchema = {
            type: 'object',
            properties: {
              model1Prop1: { type: 'string' },
            },
          };

          // Keep the valid inserts running when the invalid model fails:
          async $beforeInsert() {
            numStarted++;
            await delay(10);
          }

          $afterInsert() {
            numInserted++;
          }
        }

        const graph = [...range(7).map((i) => ({ model1Prop1: `${i}` })), { model1Prop1: 666 }];

        await expect(
          transaction(ValidatedModel1, (ValidatedModel1) =>
            ValidatedModel1.query().insertGraph(graph),
          ),
        ).rejects.toThrow(ValidationError);

        // Inserts that run after the rollback can commit their rows on SQLite:
        expect(numInserted).toBe(numStarted);
        expect(await session.knex('Model1')).toHaveLength(1);
      });

      it('should validate models upon insertion: references in integer columns should be accepted', () => {
        return transaction(Model1, Model2, (Model1, Model2) => {
          // We can modify Model1 and Model2 here since it is a subclass of the actual
          // models shared between tests.
          Model1.jsonSchema = {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              model1Id: { type: 'integer' },
              model1Prop1: { type: 'string' },
              model1Prop2: { type: 'integer' },
            },
          };

          Model2.jsonSchema = {
            type: 'object',
            properties: {
              idCol: { type: 'integer' },
              model1Id: { type: 'integer' },
              model2Prop1: { type: 'string' },
              model2Prop2: { type: 'integer' },
            },
          };

          // Clear the memoized schema.
          delete Model1.$$jsonSchema;
          delete Model2.$$jsonSchema;

          expect(Model1.getJsonSchema()).toBe(Model1.jsonSchema);
          expect(Model2.getJsonSchema()).toBe(Model2.jsonSchema);

          return Model1.query()
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted, true).then(() => inserted);
            })
            .then((inserted) => {
              expect(inserted).not.toHaveProperty('model1Prop2');
              return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      });

      it('relate: true option should cause models with id to be related instead of inserted', () => {
        return Model2.query()
          .insertGraph(
            {
              model2Prop1: 'foo',

              model2Relation1: [
                {
                  id: population.id,
                },
              ],
            },
            {
              relate: true,
            },
          )
          .then((model) => {
            return Model2.query().findById(model.idCol).withGraphFetched('model2Relation1');
          })
          .then((model) => {
            delete model.idCol;

            expect(model).toEqual({
              model1Id: null,
              model2Prop1: 'foo',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: population.id,
                  model1Id: null,
                  model1Prop1: population.model1Prop1,
                  model1Prop2: null,
                  aliasedExtra: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });

      it('noInsert option should leave out the models of the given relations', async () => {
        const model = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',
            model1Relation1: { model1Prop1: 'parent' },
            model1Relation2: [{ model2Prop1: 'child' }],
          },
          { noInsert: ['model1Relation2'] },
        );

        const fetched = await Model1.query()
          .findById(model.id)
          .withGraphFetched('[model1Relation1, model1Relation2]');
        expect(fetched.model1Relation1.model1Prop1).toBe('parent');
        expect(fetched.model1Relation2).toEqual([]);
        expect(await session.knex('model2').where('model2_prop1', 'child')).toEqual([]);
      });

      it('noRelate option should leave out the models that would be related', async () => {
        const model = await Model2.query().insertGraph(
          {
            model2Prop1: 'foo',
            model2Relation1: [{ id: population.id }, { model1Prop1: 'new' }],
          },
          { relate: true, noRelate: ['model2Relation1'] },
        );

        const fetched = await Model2.query()
          .findById(model.idCol)
          .withGraphFetched('model2Relation1');
        expect(fetched.model2Relation1.map((it) => it.model1Prop1)).toEqual(['new']);
      });

      for (const prop of ['#unrelate', '#delete']) {
        it(`should throw if ${prop} is used`, async () => {
          const err = await Model1.query()
            .insertGraph({
              model1Prop1: 'root',
              model1Relation2: [{ model2Prop1: 'marked', [prop]: true }],
            })
            .catch((err) => err);

          expect(err).toBeInstanceOf(ValidationError);
          expect(err.type).toBe('InvalidGraph');
          expect(err.message).toBe(
            '#unrelate and #delete can only be used in upsertGraph, not in insertGraph',
          );

          expect(await session.knex('Model1').where('model1Prop1', 'root')).toEqual([]);
        });

        it(`should throw if ${prop} is used for a root model`, async () => {
          const err = await Model1.query()
            .insertGraph({ model1Prop1: 'root', [prop]: true })
            .catch((err) => err);

          expect(err).toBeInstanceOf(ValidationError);
          expect(err.type).toBe('InvalidGraph');
          expect(err.message).toBe(
            '#unrelate and #delete can only be used for related models, not for root models',
          );

          expect(await session.knex('Model1').where('model1Prop1', 'root')).toEqual([]);
        });
      }

      it('should not insert the descendants of models skipped by noInsert (#215)', async () => {
        await Model1.query().insertGraph(
          {
            model1Prop1: 'root',

            model1Relation2: [
              {
                // Not inserted because of `noInsert`, and neither are its descendants.
                model2Prop1: 'skipped hasMany',

                model2Relation1: [
                  {
                    model1Prop1: 'manyToMany of skipped',
                    model1Relation1: { model1Prop1: 'belongsToOne of skipped' },
                  },
                ],
              },
            ],
          },
          { noInsert: ['model1Relation2'] },
        );

        const [model1Rows, model2Rows] = await Promise.all([
          session.knex('Model1').orderBy('id'),
          session.knex('model2'),
        ]);

        expect(model1Rows.map((row) => row.model1Prop1)).toEqual(['20', 'root']);
        expect(model2Rows.map((row) => row.id_col)).toEqual([1]);
      });

      it('should insert the models below models skipped by noInsert that #ref points to (#215)', async () => {
        const model = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',

            model1Relation1: {
              // Not inserted because of `noInsert`.
              model1Prop1: 'skipped belongsToOne',
              model1Relation2: [{ '#id': 'referenced', model2Prop1: 'referenced' }],

              model1Relation1: {
                // Not inserted because of `noInsert`, and neither are its descendants.
                model1Prop1: 'nested skipped belongsToOne',
                model1Relation2: [{ model2Prop1: 'hasMany of nested skipped' }],
              },
            },

            model1Relation3: [{ '#ref': 'referenced' }],
          },
          { allowRefs: true, noInsert: ['model1Relation1', 'model1Relation1.model1Relation1'] },
        );

        const result = await Model1.query().findById(model.id).withGraphFetched('model1Relation3');

        expect(result.model1Id).toBe(null);
        expect(result.model1Relation3.map((it) => it.model2Prop1)).toEqual(['referenced']);
        expect(
          await session.knex('model2').where('model2_prop1', 'hasMany of nested skipped'),
        ).toEqual([]);
      });

      it('should insert the models below models skipped by noInsert that #ref{} points to (#215)', async () => {
        const model = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',
            model1Prop2: '#ref{referenced.idCol}',

            model1Relation1: {
              // Not inserted because of `noInsert`.
              model1Prop1: 'skipped belongsToOne',
              model1Relation2: [{ '#id': 'referenced', model2Prop1: 'referenced' }],
            },
          },
          { allowRefs: true, noInsert: ['model1Relation1'] },
        );

        const [row] = await session.knex('model2').where('model2_prop1', 'referenced');

        expect(row.id_col).toBeTypeOf('number');
        expect(model.model1Prop2).toBe(row.id_col);
      });

      it('trying to relate a HasManyRelation should throw', () => {
        return Model1.query()
          .insertGraph(
            {
              model1Prop1: 'foo',

              model1Relation2: [
                {
                  idCol: population.model1Relation3[0].idCol,
                },
              ],
            },
            {
              relate: true,
            },
          )
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err.message).toBe(
              'You cannot relate HasManyRelation or HasOneRelation using insertGraph, because those require update operations. Consider using upsertGraph instead.',
            );
          });
      });

      it(`relate: ['relation.path'] option should cause models with id to be related instead of inserted`, () => {
        return Model1.query()
          .insert({ model1Prop1: 'howdy', id: 500 })
          .then(() => {
            return Model1.query().insertGraph(
              {
                model1Prop1: 'hello',

                model1Relation1: {
                  // This should get related.
                  id: 500,
                },

                model1Relation2: [
                  {
                    model2Prop1: 'world',

                    model2Relation1: [
                      {
                        // This should get related.
                        id: population.id,
                      },
                    ],
                  },
                ],

                model1Relation3: [
                  {
                    // This should get inserted.
                    idCol: 1000,
                  },
                ],
              },
              {
                relate: ['model1Relation1', 'model1Relation2.model2Relation1'],
              },
            );
          })
          .then((model) => {
            return Model1.query()
              .findById(model.id)
              .withGraphFetched(
                '[model1Relation1, model1Relation2.model2Relation1, model1Relation3]',
              );
          })
          .then((model) => {
            delete model.id;
            delete model.model1Relation2[0].idCol;
            delete model.model1Relation2[0].model1Id;

            expect(model).toEqual({
              model1Id: 500,
              model1Prop1: 'hello',
              model1Prop2: null,
              $afterFindCalled: 1,

              model1Relation1: {
                id: 500,
                model1Prop1: 'howdy',
                model1Id: null,
                model1Prop2: null,
                $afterFindCalled: 1,
              },

              model1Relation2: [
                {
                  model2Prop1: 'world',
                  model2Prop2: null,
                  $afterFindCalled: 1,

                  model2Relation1: [
                    {
                      id: population.id,
                      model1Id: null,
                      model1Prop1: population.model1Prop1,
                      model1Prop2: null,
                      aliasedExtra: null,
                      $afterFindCalled: 1,
                    },
                  ],
                },
              ],

              model1Relation3: [
                {
                  idCol: 1000,
                  model1Id: null,
                  model2Prop1: null,
                  model2Prop2: null,
                  extra1: null,
                  extra2: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });

      for (const relate of ['model1Relation1.^', '*']) {
        it(`relate: '${relate}' option should relate models with id at any depth`, () => {
          return Model1.query()
            .insertGraph(
              {
                model1Prop1: 'hello',

                model1Relation1: {
                  // This should get inserted.
                  model1Prop1: 'parent',

                  model1Relation1: {
                    // This should get related.
                    id: population.id,
                  },
                },
              },
              { relate },
            )
            .then((model) => {
              return Model1.query()
                .findById(model.id)
                .withGraphFetched('model1Relation1.model1Relation1');
            })
            .then((model) => {
              expect(model.model1Prop1).toBe('hello');
              expect(model.model1Relation1.model1Prop1).toBe('parent');
              expect(model.model1Relation1.model1Relation1.id).toBe(population.id);
              expect(model.model1Relation1.model1Relation1.model1Prop1).toBe(
                population.model1Prop1,
              );
            });
        });
      }

      if (utils.isPostgres(session.knex)) {
        it('query building methods should be applied to the root models', () => {
          return Model1.query()
            .insertGraph(insertion, { allowRefs: true })
            .returning('*')
            .then((inserted) => {
              return check(inserted, true).then(() => inserted);
            })
            .then((inserted) => {
              expect(inserted).toHaveProperty('model1Prop2');
              return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      }
    });

    describe('.query().insertGraphAndFetch()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should do nothing if an empty array is provided', () => {
        return Model1.query().insertGraphAndFetch([]);
      });

      it('should insert a model with relations and fetch the inserted graph', () => {
        return Model1.query()
          .insertGraphAndFetch(insertion, { allowRefs: true })
          .then((inserted) => {
            return check(inserted).then(() => inserted);
          })
          .then((inserted) => {
            return Model1.query()
              .withGraphFetched(eagerExpr)
              .findById(inserted.id)
              .then((fetched) => {
                expect(inserted.$toJson()).toContainSubset(fetched.$toJson());
                expect(fetched.$toJson()).toContainSubset(inserted.$toJson());
              });
          });
      });

      it('relate: true option should cause models with id to be related instead of inserted', () => {
        return Model2.query()
          .insertGraphAndFetch(
            {
              model2Prop1: 'foo',

              model2Relation1: [
                {
                  id: population.id,
                },
              ],
            },
            {
              relate: true,
            },
          )
          .then((model) => {
            return Model2.query().findById(model.idCol).withGraphFetched('model2Relation1');
          })
          .then((model) => {
            delete model.idCol;

            expect(model).toEqual({
              model1Id: null,
              model2Prop1: 'foo',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: population.id,
                  model1Id: null,
                  model1Prop1: population.model1Prop1,
                  model1Prop2: null,
                  aliasedExtra: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });
    });

    describe('.query().insertGraph().onConflict() (#2156)', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      const graph = () => ({
        model1Prop1: 'new root',
        model1Relation2: [{ model2Prop1: 'new child' }],
      });

      const cases = {
        'insertGraph().onConflict().ignore()': () =>
          Model1.query().insertGraph(graph()).onConflict('id').ignore(),
        'insertGraph().onConflict().merge()': () =>
          Model1.query().insertGraph(graph()).onConflict('id').merge(),
        'insertGraphAndFetch().onConflict().ignore()': () =>
          Model1.query().insertGraphAndFetch(graph()).onConflict('id').ignore(),
        'upsertGraph().onConflict().merge()': () =>
          Model1.query().upsertGraph(graph()).onConflict('id').merge(),
      };

      for (const [title, createQuery] of Object.entries(cases)) {
        it(`${title} should throw and insert nothing`, async () => {
          const method = title.includes('upsertGraph') ? 'upsertGraph' : 'insertGraph';

          await expect(createQuery()).rejects.toThrow(
            `onConflict(), ignore() and merge() are not supported by ${method}(). ` +
              'Insert the conflicting rows with a separate insert() query instead.',
          );

          const rows = await Model1.query().where('model1Prop1', 'new root');
          expect(rows).toEqual([]);
        });
      }
    });

    describe('.query().insertGraph() with new models below related models (#217)', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should throw and insert nothing', async () => {
        const err = await Model1.query()
          .insertGraph(
            {
              model1Prop1: 'root',

              model1Relation1: {
                id: population.id,
                model1Relation2: [{ model2Prop1: 'below related' }],
              },
            },
            { relate: true },
          )
          .catch((err) => err);

        expect(err).toBeInstanceOf(ValidationError);
        expect(err.type).toBe('InvalidGraph');
        expect(err.message).toBe(
          "insertGraph cannot insert the new model at 'model1Relation1.model1Relation2[0]' " +
            'below a related model. Insert it with a separate query or use upsertGraph instead',
        );

        expect(await Model1.query().where('model1Prop1', 'root')).toEqual([]);
        expect(await session.knex('model2').where('model2_prop1', 'below related')).toEqual([]);
      });

      it('should ignore existing models below related models', async () => {
        const model = await Model2.query().insertGraph(
          {
            model2Prop1: 'root',

            model2Relation1: [
              {
                id: population.id,
                model1Relation3: [{ idCol: population.model1Relation3[0].idCol }],
              },
            ],
          },
          { relate: true },
        );

        const fetched = await Model2.query()
          .findById(model.idCol)
          .withGraphFetched('model2Relation1');

        expect(fetched.model2Relation1.map((it) => it.id)).toEqual([population.id]);
      });

      it('should ignore models with ids below related models that are not related', async () => {
        const model = await Model2.query().insertGraph(
          {
            model2Prop1: 'root',

            model2Relation1: [
              {
                id: population.id,
                model1Relation3: [{ idCol: 1000, model2Prop1: 'with id' }],
              },
            ],
          },
          { relate: ['model2Relation1'] },
        );

        const fetched = await Model2.query()
          .findById(model.idCol)
          .withGraphFetched('model2Relation1');

        expect(fetched.model2Relation1.map((it) => it.id)).toEqual([population.id]);
        expect(await Model2.query().findById(1000)).toBeUndefined();
      });
    });

    describe('.query().insertGraph().allowGraph()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should allow insert when the allowed relation expression is a superset', () => {
        return Model1.query()
          .insertGraph(insertion, { allowRefs: true })
          .allowGraph(eagerExpr)
          .then((inserted) => {
            return check(inserted, true).then(() => inserted);
          });
      });

      it('should not allow insert when the allowed relation expression is not a superset', () => {
        return Model1.query()
          .insertGraph(insertion)
          .allowGraph('[model1Relation1.model1Relation3, model1Relation2]')
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err instanceof ValidationError).toBe(true);
            expect(err.type).toBe('UnallowedRelation');
            expect(err.message).toBe('trying to upsert an unallowed relation');
          });
      });
    });

    describe('.$query().insertGraph()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should insert a model with relations', () => {
        return Model1.fromJson(insertion)
          .$query()
          .insertGraph(undefined, { allowRefs: true })
          .then((inserted) => {
            return check(inserted, true).then(() => inserted);
          })
          .then((inserted) => {
            return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
          })
          .then((model) => {
            return check(model);
          });
      });
    });

    describe('.$relatedQuery().insertGraph()', () => {
      describe('belongs to one relation', () => {
        let parent;

        beforeEach(async () => {
          await session.populate(population);
          parent = await Model1.query().findById(1);
        });

        it('should insert a model with relations and relate it (#216)', async () => {
          const inserted = await parent
            .$relatedQuery('model1Relation1')
            .insertGraph(insertion, { allowRefs: true });

          expect(parent.model1Id).toBe(inserted.id);
          await check(inserted, true);

          const row = await session.knex('Model1').where('id', 1).first();
          expect(row.model1Id).toBe(inserted.id);
        });
      });

      describe('has many relation', () => {
        let parent;

        beforeEach(() => {
          return session.populate(population);
        });

        beforeEach(() => {
          return Model1.query()
            .where('id', 1)
            .first()
            .then((par) => {
              parent = par;
            });
        });

        beforeEach(() => {
          insertion = {
            model2Prop1: 'howdy',
            model2Relation1: [insertion],
          };
        });

        it('should insert a model with relations', () => {
          return parent
            .$relatedQuery('model1Relation2')
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted.model2Relation1[0], true);
            })
            .then(() => {
              return parent.$relatedQuery('model1Relation2').first();
            })
            .then((insertion) => {
              expect(insertion.model2Prop1).toBe('howdy');
              return insertion.$relatedQuery('model2Relation1').withGraphFetched(eagerExpr).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      });

      describe('many to many relation', () => {
        let parent;

        beforeEach(() => {
          return session.populate(population);
        });

        beforeEach(() => {
          return Model1.query()
            .where('id', 1)
            .first()
            .then((par) => {
              parent = par;
            });
        });

        beforeEach(() => {
          insertion = {
            model2Prop1: 'howdy',
            model2Relation1: [insertion],
          };
        });

        it('should insert a model with relations', () => {
          return parent
            .$relatedQuery('model1Relation3')
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted.model2Relation1[0], true);
            })
            .then(() => {
              return parent.$relatedQuery('model1Relation3');
            })
            .then((models) => {
              let insertion = models.find((it) => it.model2Prop1 === 'howdy');
              return insertion.$relatedQuery('model2Relation1').withGraphFetched(eagerExpr);
            })
            .then((models) => {
              let model = models.find((it) => it.model1Prop1 === 'root');
              return check(model);
            });
        });

        it('should insert and relate multiple models (#219)', async () => {
          await parent.$relatedQuery('model1Relation3').insertGraph([
            { model2Prop1: 'multi1', extra1: 'extra1' },
            { model2Prop1: 'multi2', extra1: 'extra2' },
          ]);

          const models = await parent
            .$relatedQuery('model1Relation3')
            .whereIn('model2_prop1', ['multi1', 'multi2'])
            .orderBy('model2_prop1');

          expect(models.map(({ model2Prop1, extra1 }) => ({ model2Prop1, extra1 }))).toEqual([
            { model2Prop1: 'multi1', extra1: 'extra1' },
            { model2Prop1: 'multi2', extra1: 'extra2' },
          ]);
        });
      });
    });

    function check(model, shouldCheckHooks) {
      model = model.$clone();
      let knex = model.constructor.knex();

      expect(model).toHaveProperty('model1Relation1');
      expect(model.model1Relation1).toHaveProperty('model1Relation3');
      expect(model).toHaveProperty('model1Relation2');

      model.model1Relation1.model1Relation3 = sortBy(
        model.model1Relation1.model1Relation3,
        'model2Prop1',
      );
      model.model1Relation2 = sortBy(model.model1Relation2, 'model2Prop1');

      expect(model.model1Prop1).toBe('root');
      shouldCheckHooks && checkHooks(model);

      expect(model.model1Relation1.model1Prop1).toBe('parent');
      shouldCheckHooks && checkHooks(model.model1Relation1);

      expect(model.model1Relation1Inverse.model1Prop1).toBe('rootParent');
      shouldCheckHooks && checkHooks(model.model1Relation1Inverse);

      expect(model.model1Relation1.model1Relation3[0].model2Prop1).toBe('child1');
      shouldCheckHooks && checkHooks(model.model1Relation1.model1Relation3[0]);

      expect(model.model1Relation1.model1Relation3[1].model2Prop1).toBe('cibling2');
      expect(model.model1Relation1.model1Relation3[1].extra1).toBe('extraVal1');
      expect(model.model1Relation1.model1Relation3[1].extra2).toBe('extraVal2');
      expect(model.model1Relation1.model1Relation3[2].idCol).toBe(1);
      expect(model.model1Relation1.model1Relation3[2].extra1).toBe('foo');
      shouldCheckHooks && checkHooks(model.model1Relation1.model1Relation3[1]);

      expect(model.model1Relation2[0].model2Prop1).toBe('child1');
      shouldCheckHooks && checkHooks(model.model1Relation2[0]);

      expect(model.model1Relation2[1].model2Prop1).toBe('child2');
      shouldCheckHooks && checkHooks(model.model1Relation2[1]);

      expect(model.model1Relation2[1].model2Relation2.model1Prop1).toBe('child3');
      shouldCheckHooks && checkHooks(model.model1Relation2[1].model2Relation2);

      return knex(Model2.getTableName()).then((rows) => {
        // Check that the reference model was only inserted once.
        expect(rows.filter((it) => it.model2_prop1 === 'child1')).toHaveLength(1);
      });
    }

    function checkHooks(model) {
      expect(model.$beforeInsertCalled).toBe(1);
      expect(model.$afterInsertCalled).toBe(1);
    }
  });
};
