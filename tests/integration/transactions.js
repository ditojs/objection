import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { transaction } from 'objection';
import * as knexUtils from '../../lib/utils/knexUtils.js';
import { delay, range } from '../../testUtils/testUtils.js';

export default (session) => {
  let Model1 = session.models.Model1;
  let Model2 = session.models.Model2;

  describe('transaction', () => {
    beforeEach(() => {
      return session.populate([]);
    });

    const noop = () => {};

    beforeAll(() => {
      // Some of the tests _should_ leak an exception, but we don't want vitest to report them.
      // vitest leaves unhandled rejections alone when there's another listener for them.
      process.on('unhandledRejection', noop);
    });

    afterAll(() => {
      process.off('unhandledRejection', noop);
    });

    it('should resolve an empty transaction', () => {
      return transaction(Model1, Model2, () => {
        return { a: 1 };
      }).then((result) => {
        expect(result).toEqual({ a: 1 });
      });
    });

    it('should fail without models', () => {
      return expect(
        transaction(() => {
          return { a: 1 };
        }),
      ).rejects.toThrow();
    });

    it('should fail if one of the model classes is not a subclass of Model', () => {
      return expect(
        transaction(
          Model1,
          function () {},
          () => {
            return { a: 1 };
          },
        ),
      ).rejects.toThrow();
    });

    it('should fail if all ModelClasses are not bound to the same knex connection', () => {
      return expect(
        transaction(Model1, Model2.bindKnex({}), () => {
          return { a: 1 };
        }),
      ).rejects.toThrow();
    });

    it('should commit transaction if no errors occur (1)', () => {
      return transaction(Model1, Model2, (Model1, Model2) => {
        return Model1.query()
          .insert({ model1Prop1: 'test 1' })
          .then(() => {
            return Model1.query().insert({ model1Prop1: 'test 2' });
          })
          .then(() => {
            return Model2.query().insert({ model2Prop1: 'test 3' });
          });
      })
        .then((result) => {
          expect(result.model2Prop1).toBe('test 3');
          return session.knex('Model1');
        })
        .then((rows) => {
          expect(rows).toHaveLength(2);
          expect(rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);
          return session.knex('model2');
        })
        .then((rows) => {
          expect(rows).toHaveLength(1);
          expect(rows[0].model2_prop1).toBe('test 3');
        });
    });

    it('should commit transaction if no errors occur (Model.transaction)', async () => {
      const result = await Model1.transaction(async (trx) => {
        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await Model1.query(trx).insert({ model1Prop1: 'test 2' });
        return Model2.query(trx).insert({ model2Prop1: 'test 3' });
      });

      expect(result.model2Prop1).toBe('test 3');
      let rows = await session.knex('Model1');

      expect(rows).toHaveLength(2);
      expect(rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);
      rows = await session.knex('model2');

      expect(rows).toHaveLength(1);
      expect(rows[0].model2_prop1).toBe('test 3');
    });

    it('should commit transaction if no errors occur (Model.transaction with two args)', async () => {
      const result = await Model1.transaction(Model1.knex(), async (trx) => {
        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await Model1.query(trx).insert({ model1Prop1: 'test 2' });
        return Model2.query(trx).insert({ model2Prop1: 'test 3' });
      });

      expect(result.model2Prop1).toBe('test 3');
      let rows = await session.knex('Model1');

      expect(rows).toHaveLength(2);
      expect(rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);
      rows = await session.knex('model2');

      expect(rows).toHaveLength(1);
      expect(rows[0].model2_prop1).toBe('test 3');
    });

    it('should commit transaction if no errors occur (2)', () => {
      return transaction(Model1, (Model1) => {
        return Model1.query().insertGraph([
          {
            model1Prop1: 'a',
            model1Relation1: {
              model1Prop1: 'b',
            },
            model1Relation2: [
              {
                model2Prop1: 'c',
                model2Relation1: [
                  {
                    model1Prop1: 'd',
                  },
                ],
              },
            ],
          },
        ]);
      })
        .then(() => {
          return Promise.all([
            session.knex('Model1').orderBy('model1Prop1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(3);
          expect(rows1.map((it) => it.model1Prop1)).toEqual(['a', 'b', 'd']);
          expect(rows2).toHaveLength(1);
          expect(rows2[0].model2_prop1).toBe('c');
          expect(rows3).toHaveLength(1);
        });
    });

    it('should commit transaction if no errors occur (3)', () => {
      return Model1.knex()
        .transaction((trx) => {
          return Model1.query(trx).insertGraph([
            {
              model1Prop1: 'a',
              model1Relation1: {
                model1Prop1: 'b',
              },
              model1Relation2: [
                {
                  model2Prop1: 'c',
                  model2Relation1: [
                    {
                      model1Prop1: 'd',
                    },
                  ],
                },
              ],
            },
          ]);
        })
        .then(() => {
          return Promise.all([
            session.knex('Model1').orderBy('model1Prop1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(3);
          expect(rows1.map((it) => it.model1Prop1)).toEqual(['a', 'b', 'd']);
          expect(rows2).toHaveLength(1);
          expect(rows2[0].model2_prop1).toBe('c');
          expect(rows3).toHaveLength(1);
        });
    });

    it('should rollback if an error occurs (1)', () => {
      return transaction(Model1, Model2, (Model1, Model2) => {
        return Model1.query()
          .insert({ model1Prop1: 'test 1' })
          .then(() => {
            return Model1.query().insert({ model1Prop1: 'test 2' });
          })
          .then(() => {
            return Model2.query().insert({ model2Prop1: 'test 3' });
          })
          .then(() => {
            throw new Error('whoops');
          });
      })
        .catch((err) => {
          expect(err.message).toBe('whoops');
          return session.knex('Model1');
        })
        .then((rows) => {
          expect(rows).toHaveLength(0);
          return session.knex('model2');
        })
        .then((rows) => {
          expect(rows).toHaveLength(0);
        });
    });

    it('should rollback if an error occurs (Model.transaction)', async () => {
      try {
        await Model1.transaction(async (trx) => {
          await Model1.query(trx).insert({ model1Prop1: 'test 1' });
          await Model1.query(trx).insert({ model1Prop1: 'test 2' });
          await Model2.query(trx).insert({ model2Prop1: 'test 3' });

          throw new Error('whoops');
        });

        throw new Error('should not get here');
      } catch (err) {
        expect(err.message).toBe('whoops');

        let rows = await session.knex('Model1');
        expect(rows).toHaveLength(0);

        rows = await session.knex('model2');
        expect(rows).toHaveLength(0);
      }
    });

    it('should rollback if an error occurs (2)', () => {
      return transaction(Model1, (Model1) => {
        return Model1.query()
          .insert({ model1Prop1: 'test 1' })
          .then((model) => {
            return model.$relatedQuery('model1Relation2').insert({ model2Prop2: 1000 });
          })
          .then(() => {
            throw new Error('whoops');
          });
      })
        .catch((err) => {
          expect(err.message).toBe('whoops');
          return session.knex('Model1');
        })
        .then((rows) => {
          expect(rows).toHaveLength(0);
          return session.knex('model2');
        })
        .then((rows) => {
          expect(rows).toHaveLength(0);
        });
    });

    it('should rollback if an error occurs (3)', () => {
      return transaction(Model1, (Model1) => {
        return Model1.query()
          .insertGraph([
            {
              model1Prop1: 'a',
              model1Relation1: {
                model1Prop1: 'b',
              },
              model1Relation2: [
                {
                  model2Prop1: 'c',
                  model2Relation1: [
                    {
                      model1Prop1: 'd',
                    },
                  ],
                },
              ],
            },
          ])
          .then(() => {
            throw new Error('whoops');
          });
      })
        .catch((err) => {
          expect(err.message).toBe('whoops');

          return Promise.all([
            session.knex('Model1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(0);
          expect(rows2).toHaveLength(0);
          expect(rows3).toHaveLength(0);
        });
    });

    it('should rollback if an error occurs (4)', () => {
      return Model1.knex()
        .transaction((trx) => {
          return Model1.query(trx)
            .insertGraph([
              {
                model1Prop1: 'a',
                model1Relation1: {
                  model1Prop1: 'b',
                },
                model1Relation2: [
                  {
                    model2Prop1: 'c',
                    model2Relation1: [
                      {
                        model1Prop1: 'd',
                      },
                    ],
                  },
                ],
              },
            ])
            .then((models) => {
              return models[0]
                .$relatedQuery('model1Relation2', trx)
                .insert({ model2Prop1: 'e' })
                .then(() => models);
            })
            .then((models) => {
              return models[0]
                .$relatedQuery('model1Relation2')
                .transacting(trx)
                .insert({ model2Prop1: 'f' })
                .then(() => models);
            })
            .then((models) => {
              return Model1.query(trx)
                .findById(models[0].id)
                .then((it) => it.$fetchGraph('model1Relation1', { transaction: trx }))
                .then((it) => expect(it.model1Relation1.model1Prop1).toBe('b'))
                .then(() => models);
            })
            .then((models) => {
              expect(models[0].$query(trx).knex()).toBe(trx);
            })
            .then(() => {
              throw new Error('whoops');
            });
        })
        .catch((err) => {
          console.log(err);
          expect(err.message).toBe('whoops');

          return Promise.all([
            session.knex('Model1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(0);
          expect(rows2).toHaveLength(0);
          expect(rows3).toHaveLength(0);
        });
    });

    it('should rollback if an error occurs (5)', () => {
      return transaction(Model1.knex(), (trx) => {
        return Model1.query(trx)
          .insertGraph([
            {
              model1Prop1: 'a',
              model1Relation1: {
                model1Prop1: 'b',
              },
              model1Relation2: [
                {
                  model2Prop1: 'c',
                  model2Relation1: [
                    {
                      model1Prop1: 'd',
                    },
                  ],
                },
              ],
            },
          ])
          .then((models) => {
            return models[0]
              .$relatedQuery('model1Relation2', trx)
              .insert({ model2Prop1: 'e' })
              .then(() => models);
          })
          .then((models) => {
            return models[0]
              .$relatedQuery('model1Relation2')
              .transacting(trx)
              .insert({ model2Prop1: 'f' })
              .then(() => models);
          })
          .then((models) => {
            return Model1.query(trx)
              .findById(models[0].id)
              .then((it) => it.$fetchGraph('model1Relation1', { transaction: trx }))
              .then((it) => expect(it.model1Relation1.model1Prop1).toBe('b'))
              .then(() => models);
          })
          .then((models) => {
            expect(models[0].$query(trx).knex()).toBe(trx);
          })
          .then(() => {
            throw new Error('whoops');
          });
      })
        .catch((err) => {
          expect(err.message).toBe('whoops');

          return Promise.all([
            session.knex('Model1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(0);
          expect(rows2).toHaveLength(0);
          expect(rows3).toHaveLength(0);
        });
    });

    it('should rollback if the rollback method is called (no return)', () => {
      return transaction(Model1.knex(), (trx) => {
        Model1.query(trx)
          .insertGraph([
            {
              model1Prop1: 'a',
              model1Relation1: {
                model1Prop1: 'b',
              },
              model1Relation2: [
                {
                  model2Prop1: 'c',
                  model2Relation1: [
                    {
                      model1Prop1: 'd',
                    },
                  ],
                },
              ],
            },
          ])
          .then((models) => {
            return models[0]
              .$relatedQuery('model1Relation2', trx)
              .insert({ model2Prop1: 'e' })
              .then(() => models);
          })
          .then((models) => {
            return models[0]
              .$relatedQuery('model1Relation2')
              .transacting(trx)
              .insert({ model2Prop1: 'f' })
              .then(() => models);
          })
          .then((models) => {
            expect(models[0].$query(trx).knex()).toBe(trx);
          })
          .then(() => {
            trx.rollback(new Error('whoops'));
          });
      })
        .catch((err) => {
          expect(err.message).toBe('whoops');

          return Promise.all([
            session.knex('Model1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(0);
          expect(rows2).toHaveLength(0);
          expect(rows3).toHaveLength(0);
        });
    });

    it('should rollback if the rollback method is called (with return)', () => {
      return transaction(Model1.knex(), (trx) => {
        return Model1.query(trx)
          .insertGraph([
            {
              model1Prop1: 'a',
              model1Relation1: {
                model1Prop1: 'b',
              },
              model1Relation2: [
                {
                  model2Prop1: 'c',
                  model2Relation1: [
                    {
                      model1Prop1: 'd',
                    },
                  ],
                },
              ],
            },
          ])
          .then(() => {
            return trx.rollback(new Error('whoops'));
          });
      })
        .catch((err) => {
          expect(err.message).toBe('whoops');

          return Promise.all([
            session.knex('Model1'),
            session.knex('model2'),
            session.knex('Model1Model2'),
          ]);
        })
        .then(([rows1, rows2, rows3]) => {
          expect(rows1).toHaveLength(0);
          expect(rows2).toHaveLength(0);
          expect(rows3).toHaveLength(0);
        });
    });

    it('should skip queries after rollback', () => {
      return transaction(Model1, (Model1) => {
        return Model1.query()
          .insert({ model1Prop1: '123' })
          .then(() => {
            return Promise.all(
              range(2).map((i) => {
                if (i === 1) {
                  throw new Error();
                }
                return Model1.query().insert({ model1Prop1: i.toString() }).then();
              }),
            );
          });
      })
        .catch(() => {
          return delay(5).then(() => {
            return session.knex('Model1');
          });
        })
        .then((rows) => {
          expect(rows).toHaveLength(0);
          return session.knex('model2');
        })
        .then((rows) => {
          expect(rows).toHaveLength(0);
        });
    });

    it('bound model class should accept unbound model instances', () => {
      let unboundModel = Model1.fromJson({ model1Prop1: '123' });

      return transaction(Model1, (Model1) => {
        return Model1.query().insert(unboundModel);
      })
        .then((inserted) => {
          expect(inserted.model1Prop1).toBe('123');
          return session.knex('Model1');
        })
        .then((rows) => {
          expect(rows).toHaveLength(1);
          expect(rows[0].model1Prop1).toBe('123');
        });
    });

    it('last argument should be the knex transaction object', () => {
      return transaction(Model1, Model2, (Model1, Model2, trx) => {
        expect(trx).toBe(Model1.knex());
      });
    });

    it('if knex instance is passed, should be equivalent to knex.transaction()', () => {
      return transaction(Model1.knex(), (trx) => {
        return trx('Model1').insert({ model1Prop1: '1' });
      })
        .then(() => {
          return session.knex('Model1');
        })
        .then((rows) => {
          expect(rows).toHaveLength(1);
          expect(rows[0].model1Prop1).toBe('1');
        });
    });

    describe('transaction.start() / Model.startTransaction()', () => {
      it('should commit transaction when the commit method is called', () => {
        let trx;

        return transaction
          .start(Model1)
          .then((trans) => {
            trx = trans;
            return Model1.bindKnex(trx).query().insert({ model1Prop1: 'test 1' });
          })
          .then(() => {
            return Model1.bindKnex(trx).query().insert({ model1Prop1: 'test 2' });
          })
          .then(() => {
            return Model2.bindKnex(trx).query().insert({ model2Prop1: 'test 3' });
          })
          .then(() => {
            return trx.commit();
          })
          .then(() => {
            return session.knex('Model1');
          })
          .then((rows) => {
            expect(rows).toHaveLength(2);
            expect(rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);
            return session.knex('model2');
          })
          .then((rows) => {
            expect(rows).toHaveLength(1);
            expect(rows[0].model2_prop1).toBe('test 3');
          });
      });

      it('should commit transaction when the commit method is called (Model.startTransaction())', () => {
        let trx;

        return Model1.startTransaction()
          .then((trans) => {
            trx = trans;
            return Model1.bindKnex(trx).query().insert({ model1Prop1: 'test 1' });
          })
          .then(() => {
            return Model1.bindKnex(trx).query().insert({ model1Prop1: 'test 2' });
          })
          .then(() => {
            return Model2.bindKnex(trx).query().insert({ model2Prop1: 'test 3' });
          })
          .then(() => {
            return trx.commit();
          })
          .then(() => {
            return session.knex('Model1');
          })
          .then((rows) => {
            expect(rows).toHaveLength(2);
            expect(rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);
            return session.knex('model2');
          })
          .then((rows) => {
            expect(rows).toHaveLength(1);
            expect(rows[0].model2_prop1).toBe('test 3');
          });
      });

      it('commit should work with yield (and thus async/await)', async () => {
        const trx = await transaction.start(Model1.knex());

        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await Model1.query(trx).insert({ model1Prop1: 'test 2' });
        await Model2.query(trx).insert({ model2Prop1: 'test 3' });
        await trx.commit();

        const model1Rows = await session.knex('Model1');
        const model2Rows = await session.knex('model2');

        expect(model1Rows).toHaveLength(2);
        expect(model1Rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);

        expect(model2Rows).toHaveLength(1);
        expect(model2Rows[0].model2_prop1).toBe('test 3');
      });

      it('commit should work with yield (and thus async/await) (Model.startTransaction())', async () => {
        const trx = await Model1.startTransaction();

        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await Model1.query(trx).insert({ model1Prop1: 'test 2' });
        await Model2.query(trx).insert({ model2Prop1: 'test 3' });
        await trx.commit();

        const model1Rows = await session.knex('Model1');
        const model2Rows = await session.knex('model2');

        expect(model1Rows).toHaveLength(2);
        expect(model1Rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);

        expect(model2Rows).toHaveLength(1);
        expect(model2Rows[0].model2_prop1).toBe('test 3');
      });

      it('rollback should work with yield (and thus async/await)', async () => {
        const trx = await transaction.start(Model1.knex());

        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await Model1.query(trx).insert({ model1Prop1: 'test 2' });
        await Model2.query(trx).insert({ model2Prop1: 'test 3' });
        await trx.rollback();

        const model1Rows = await session.knex('Model1');
        const model2Rows = await session.knex('model2');

        expect(model1Rows).toHaveLength(0);
        expect(model2Rows).toHaveLength(0);
      });

      it('should work when a knex connection is passed instead of a model', () => {
        let trx;
        return transaction
          .start(Model1.knex())
          .then((trans) => {
            trx = trans;
            return Model1.bindTransaction(trx).query().insert({ model1Prop1: 'test 1' });
          })
          .then(() => {
            return Model1.bindTransaction(trx).query().insert({ model1Prop1: 'test 2' });
          })
          .then(() => {
            return Model2.bindTransaction(trx).query().insert({ model2Prop1: 'test 3' });
          })
          .then(() => {
            return trx.commit();
          })
          .then(() => {
            return session.knex('Model1');
          })
          .then((rows) => {
            expect(rows).toHaveLength(2);
            expect(rows.map((it) => it.model1Prop1).sort()).toEqual(['test 1', 'test 2']);
            return session.knex('model2');
          })
          .then((rows) => {
            expect(rows).toHaveLength(1);
            expect(rows[0].model2_prop1).toBe('test 3');
          });
      });

      it('should rollback transaction when the rollback method is called', () => {
        let trx;
        return transaction
          .start(Model1)
          .then((trans) => {
            trx = trans;
            return Model1.bindTransaction(trx).query().insert({ model1Prop1: 'test 1' });
          })
          .then(() => {
            return Model1.bindTransaction(trx).query().insert({ model1Prop1: 'test 2' });
          })
          .then(() => {
            return Model2.bindTransaction(trx).query().insert({ model2Prop1: 'test 3' });
          })
          .then(() => {
            return trx.rollback();
          })
          .then(() => {
            return session.knex('Model1');
          })
          .then((rows) => {
            expect(rows).toHaveLength(0);
            return session.knex('model2');
          })
          .then((rows) => {
            expect(rows).toHaveLength(0);
          });
      });

      it('should fail if neither a model or a knex connection is passed', () => {
        return expect(transaction.start({})).rejects.toThrow();
      });
    });

    describe('trx.executionPromise', () => {
      function onCommit(trx) {
        return trx.executionPromise.then(
          () => true,
          () => false,
        );
      }

      it('should resolve after commit (Model.transaction)', async () => {
        let committed;
        await Model1.transaction(async (trx) => {
          committed = onCommit(trx);
          await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        });

        expect(await committed).toBe(true);
        expect(await session.knex('Model1')).toHaveLength(1);
      });

      it('should reject on rollback (Model.transaction)', async () => {
        let committed;
        await Model1.transaction(async (trx) => {
          committed = onCommit(trx);
          await Model1.query(trx).insert({ model1Prop1: 'test 1' });
          throw new Error('rollback');
        }).catch(noop);

        expect(await committed).toBe(false);
        expect(await session.knex('Model1')).toHaveLength(0);
      });

      it('should resolve after commit (Model.startTransaction)', async () => {
        const trx = await Model1.startTransaction();
        const committed = onCommit(trx);
        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await trx.commit();

        expect(await committed).toBe(true);
        expect(await session.knex('Model1')).toHaveLength(1);
      });

      it('should reject on rollback with an error (Model.startTransaction)', async () => {
        const trx = await Model1.startTransaction();
        const committed = onCommit(trx);
        await Model1.query(trx).insert({ model1Prop1: 'test 1' });
        await trx.rollback(new Error('rollback'));

        expect(await committed).toBe(false);
        expect(await session.knex('Model1')).toHaveLength(0);
      });
    });

    describe('model.$knex()', () => {
      it("model.$knex() methods should return the model's transaction", () => {
        return transaction
          .start(Model1)
          .then((trx) => {
            return Model1.bindTransaction(trx).query().insert({ model1Prop1: 'test 1' });
          })
          .then((model) => {
            return Model1.bindTransaction(model.$knex()).query().insert({ model1Prop1: 'test 2' });
          })
          .then((model) => {
            return Model2.bindTransaction(model.$knex()).query().insert({ model2Prop1: 'test 3' });
          })
          .then((model) => {
            return model.$knex().rollback();
          })
          .then(() => {
            return session.knex('Model1');
          })
          .then((rows) => {
            expect(rows).toHaveLength(0);
            return session.knex('model2');
          })
          .then((rows) => {
            expect(rows).toHaveLength(0);
          });
      });
    });
  });
};
