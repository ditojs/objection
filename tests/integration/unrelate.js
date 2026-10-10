import { describe, it, expect, beforeEach } from 'vitest';

export default (session) => {
  let Model1 = session.models.Model1;
  let Model2 = session.models.Model2;

  describe('Model unrelate queries', () => {
    describe('.$query()', () => {
      it('should reject the query', () => {
        return expect(Model1.fromJson({ id: 1 }).$query().unrelate()).rejects.toThrow();
      });
    });

    describe('.$relatedQuery().unrelate()', () => {
      describe('belongs to one relation', () => {
        beforeEach(() => {
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
              model1Prop1: 'hello 3',

              model1Relation1: {
                id: 4,
                model1Prop1: 'hello 4',
              },

              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'foo',
                },
              ],
            },
          ]);
        });

        it('should unrelate', () => {
          return Model1.query()
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation1').unrelate();
            })
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              return session.knex(Model1.getTableName()).orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows[0].model1Id).toBeNull();
              expect(rows[1].model1Id).toBeNull();
              expect(rows[2].model1Id).toBe(4);
              expect(rows[3].model1Id).toBeNull();
            });
        });

        it('should fail if arguments are given', () => {
          return Model1.query()
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation1').unrelate(1);
            })
            .then(() => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err.message).toBe(
                `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
              );
            });
        });
      });

      describe('has many relation', () => {
        beforeEach(() => {
          return session.populate([
            {
              id: 1,
              model1Prop1: 'hello 1',
              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'text 1',
                  model2Prop2: 6,
                },
                {
                  idCol: 2,
                  model2Prop1: 'text 2',
                  model2Prop2: 5,
                },
                {
                  idCol: 3,
                  model2Prop1: 'text 3',
                  model2Prop2: 4,
                },
              ],
            },
            {
              id: 2,
              model1Prop1: 'hello 2',
              model1Relation2: [
                {
                  idCol: 4,
                  model2Prop1: 'text 4',
                  model2Prop2: 3,
                },
              ],
            },
          ]);
        });

        it('should unrelate', () => {
          return Model1.query()
            .where('id', 1)
            .first()
            .then((model) => {
              return model.$relatedQuery('model1Relation2').unrelate().where('id_col', 2);
            })
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              return session.knex(Model2.getTableName()).orderBy('id_col');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows[0].model1_id).toBe(1);
              expect(rows[1].model1_id).toBeNull();
              expect(rows[2].model1_id).toBe(1);
              expect(rows[3].model1_id).toBe(2);
            });
        });

        it('should unrelate multiple', () => {
          return Model1.query()
            .where('id', 1)
            .first()
            .then((model) => {
              return model.$relatedQuery('model1Relation2').unrelate().where('id_col', '>', 1);
            })
            .then((numUpdated) => {
              expect(numUpdated).toBe(2);
              return session.knex(Model2.getTableName()).orderBy('id_col');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows[0].model1_id).toBe(1);
              expect(rows[1].model1_id).toBeNull();
              expect(rows[2].model1_id).toBeNull();
              expect(rows[3].model1_id).toBe(2);
            });
        });

        it('should fail if arguments are given', () => {
          return Model1.query()
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model1Relation2').unrelate([1, 2]);
            })
            .then((numUpdated) => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err.message).toBe(
                `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
              );
            });
        });
      });

      describe('many to many relation', () => {
        beforeEach(() => {
          return session.populate([
            {
              id: 1,
              model1Prop1: 'hello 1',
              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'text 1',
                  model2Relation1: [
                    {
                      id: 3,
                      model1Prop1: 'blaa 1',
                      model1Prop2: 6,
                    },
                    {
                      id: 4,
                      model1Prop1: 'blaa 2',
                      model1Prop2: 5,
                    },
                    {
                      id: 5,
                      model1Prop1: 'blaa 3',
                      model1Prop2: 4,
                    },
                  ],
                },
              ],
            },
            {
              id: 2,
              model1Prop1: 'hello 2',
              model1Relation2: [
                {
                  idCol: 2,
                  model2Prop1: 'text 2',
                  model2Relation1: [
                    {
                      id: 6,
                      model1Prop1: 'blaa 4',
                      model1Prop2: 3,
                    },
                  ],
                },
              ],
            },
          ]);
        });

        it('should unrelate', () => {
          return Model2.query()
            .where('id_col', 1)
            .first()
            .then((model) => {
              return model.$relatedQuery('model2Relation1').unrelate().where('Model1.id', 4);
            })
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              return session.knex('Model1Model2').orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(3);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 3)).toHaveLength(1);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 4)).toHaveLength(0);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 5)).toHaveLength(1);
              expect(rows.filter((it) => it.model2Id === 2 && it.model1Id === 6)).toHaveLength(1);
            });
        });

        it('should unrelate multiple', () => {
          return Model2.query()
            .findById(1)
            .then((model) => {
              return model
                .$relatedQuery('model2Relation1')
                .unrelate()
                .where('model1Prop1', '>', 'blaa 1');
            })
            .then((numDeleted) => {
              expect(numDeleted).toBe(2);
              return session.knex('Model1Model2').orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(2);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 3)).toHaveLength(1);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 4)).toHaveLength(0);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 5)).toHaveLength(0);
              expect(rows.filter((it) => it.model2Id === 2 && it.model1Id === 6)).toHaveLength(1);
            });
        });

        it('should fail if arguments are given', () => {
          return Model2.query()
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model2Relation1').unrelate([1, 2]);
            })
            .then((numUpdated) => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err.message).toBe(
                `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
              );
            });
        });
      });

      describe('has one through relation', () => {
        beforeEach(() => {
          return session.populate([
            {
              id: 1,
              model1Prop1: 'hello 1',
              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'text 1',

                  model2Relation2: {
                    id: 5,
                    model1Prop1: 'blaa 3',
                    model1Prop2: 4,
                  },
                },
              ],
            },
            {
              id: 2,
              model1Prop1: 'hello 2',
              model1Relation2: [
                {
                  idCol: 2,
                  model2Prop1: 'text 2',

                  model2Relation2: {
                    id: 6,
                    model1Prop1: 'blaa 4',
                    model1Prop2: 5,
                  },

                  model2Relation1: [
                    {
                      id: 7,
                      model1Prop1: 'blaa 5',
                      model1Prop2: 4,
                    },
                  ],
                },
              ],
            },
          ]);
        });

        it('should unrelate', () => {
          return Model2.query()
            .where('id_col', 2)
            .first()
            .then((model) => {
              return model.$relatedQuery('model2Relation2').unrelate();
            })
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              return session.knex('Model1Model2One');
            })
            .then((rows) => {
              expect(rows).toHaveLength(1);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 5)).toHaveLength(1);
            });
        });
      });
    });

    describe('.relatedQuery().unrelate()', () => {
      describe('belongs to one relation', () => {
        beforeEach(() => {
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
              model1Prop1: 'hello 3',

              model1Relation1: {
                id: 4,
                model1Prop1: 'hello 4',
              },

              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'foo',
                },
              ],
            },
          ]);
        });

        it('should unrelate using one id', () => {
          return Model1.relatedQuery('model1Relation1')
            .for(1)
            .unrelate()
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              return session.knex(Model1.getTableName()).orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id: 1, model1Id: null },
                { id: 2, model1Id: null },
                { id: 3, model1Id: 4 },
                { id: 4, model1Id: null },
              ]);
            });
        });

        it('should unrelate using multiple ids', () => {
          return Model1.relatedQuery('model1Relation1')
            .for([1, 3])
            .unrelate()
            .then((numUpdated) => {
              expect(numUpdated).toBe(2);
              return session.knex(Model1.getTableName()).orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id: 1, model1Id: null },
                { id: 2, model1Id: null },
                { id: 3, model1Id: null },
                { id: 4, model1Id: null },
              ]);
            });
        });

        it('should unrelate using subquery', () => {
          return Model1.relatedQuery('model1Relation1')
            .for(Model1.query().findByIds([1, 3]))
            .unrelate()
            .then((numUpdated) => {
              expect(numUpdated).toBe(2);
              return session.knex(Model1.getTableName()).orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id: 1, model1Id: null },
                { id: 2, model1Id: null },
                { id: 3, model1Id: null },
                { id: 4, model1Id: null },
              ]);
            });
        });

        // Filters don't work on mysql when the related table and the
        // owner table are the same.
        if (!session.isMySql()) {
          it('should unrelate using multiple ids and a filter', () => {
            return Model1.relatedQuery('model1Relation1')
              .for([1, 3])
              .unrelate()
              .where('model1Prop1', '!=', 'hello 2')
              .then((numUpdated) => {
                expect(numUpdated).toBe(1);
                return session.knex(Model1.getTableName()).orderBy('id');
              })
              .then((rows) => {
                expect(rows).toHaveLength(4);
                expect(rows).toContainSubset([
                  { id: 1, model1Id: 2 },
                  { id: 2, model1Id: null },
                  { id: 3, model1Id: null },
                  { id: 4, model1Id: null },
                ]);
              });
          });
        }

        it('should fail if arguments are given', () => {
          return Model1.relatedQuery('model1Relation1')
            .for(1)
            .unrelate(1)
            .then(() => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err.message).toBe(
                `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
              );
            });
        });
      });

      describe('has many relation', () => {
        beforeEach(() => {
          return session.populate([
            {
              id: 1,
              model1Prop1: 'hello 1',
              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'text 1',
                  model2Prop2: 6,
                },
                {
                  idCol: 2,
                  model2Prop1: 'text 2',
                  model2Prop2: 5,
                },
                {
                  idCol: 3,
                  model2Prop1: 'text 3',
                  model2Prop2: 4,
                },
              ],
            },
            {
              id: 2,
              model1Prop1: 'hello 2',
              model1Relation2: [
                {
                  idCol: 4,
                  model2Prop1: 'text 4',
                  model2Prop2: 3,
                },
              ],
            },
          ]);
        });

        it('should unrelate for one parent', () => {
          return Model1.relatedQuery('model1Relation2')
            .for(1)
            .unrelate()
            .whereIn('id_col', [2, 4])
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              return session.knex(Model2.getTableName()).orderBy('id_col');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id_col: 1, model1_id: 1 },
                { id_col: 2, model1_id: null },
                { id_col: 3, model1_id: 1 },
                { id_col: 4, model1_id: 2 },
              ]);
            });
        });

        it('should unrelate for one parent using a subquery', () => {
          return Model1.relatedQuery('model1Relation2')
            .for(Model1.query().findById(1))
            .unrelate()
            .whereIn('id_col', [2, 4])
            .then((numUpdated) => {
              expect(numUpdated).toBe(1);
              return session.knex(Model2.getTableName()).orderBy('id_col');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id_col: 1, model1_id: 1 },
                { id_col: 2, model1_id: null },
                { id_col: 3, model1_id: 1 },
                { id_col: 4, model1_id: 2 },
              ]);
            });
        });

        it('should unrelate for two parents', () => {
          return Model1.relatedQuery('model1Relation2')
            .for([1, 2])
            .unrelate()
            .whereIn('id_col', [2, 4])
            .then((numUpdated) => {
              expect(numUpdated).toBe(2);
              return session.knex(Model2.getTableName()).orderBy('id_col');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id_col: 1, model1_id: 1 },
                { id_col: 2, model1_id: null },
                { id_col: 3, model1_id: 1 },
                { id_col: 4, model1_id: null },
              ]);
            });
        });

        it('should unrelate multiple', () => {
          return Model1.relatedQuery('model1Relation2')
            .for(1)
            .unrelate()
            .where('id_col', '>', 1)
            .then((numUpdated) => {
              expect(numUpdated).toBe(2);
              return session.knex(Model2.getTableName()).orderBy('id_col');
            })
            .then((rows) => {
              expect(rows).toHaveLength(4);
              expect(rows).toContainSubset([
                { id_col: 1, model1_id: 1 },
                { id_col: 2, model1_id: null },
                { id_col: 3, model1_id: null },
                { id_col: 4, model1_id: 2 },
              ]);
            });
        });

        it('should fail if arguments are given', () => {
          return Model1.relatedQuery('model1Relation2')
            .for(1)
            .unrelate([1, 2])
            .then(() => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err.message).toBe(
                `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
              );
            });
        });
      });

      describe('many to many relation', () => {
        beforeEach(() => {
          return session.populate([
            {
              id: 1,
              model1Prop1: 'hello 1',
              model1Relation2: [
                {
                  idCol: 1,
                  model2Prop1: 'text 1',
                  model2Relation1: [
                    {
                      id: 3,
                      model1Prop1: 'blaa 1',
                      model1Prop2: 6,
                    },
                    {
                      id: 4,
                      model1Prop1: 'blaa 2',
                      model1Prop2: 5,
                    },
                    {
                      id: 5,
                      model1Prop1: 'blaa 3',
                      model1Prop2: 4,
                    },
                  ],
                },
              ],
            },
            {
              id: 2,
              model1Prop1: 'hello 2',
              model1Relation2: [
                {
                  idCol: 2,
                  model2Prop1: 'text 2',
                  model2Relation1: [
                    {
                      id: 6,
                      model1Prop1: 'blaa 4',
                      model1Prop2: 3,
                    },
                  ],
                },
              ],
            },
          ]);
        });

        it('should unrelate using one parent id', () => {
          return Model2.relatedQuery('model2Relation1')
            .for(1)
            .unrelate()
            .whereIn('Model1.id', [4, 6])
            .then((numDeleted) => {
              expect(numDeleted).toBe(1);
              return session.knex('Model1Model2').orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(3);
              expect(rows).toContainSubset([
                { model2Id: 1, model1Id: 3 },
                { model2Id: 1, model1Id: 5 },
                { model2Id: 2, model1Id: 6 },
              ]);
            });
        });

        it('should unrelate using two parent ids', () => {
          return Model2.relatedQuery('model2Relation1')
            .for([1, 2])
            .unrelate()
            .whereIn('Model1.id', [4, 6])
            .then((numDeleted) => {
              expect(numDeleted).toBe(2);
              return session.knex('Model1Model2').orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(2);
              expect(rows).toContainSubset([
                { model2Id: 1, model1Id: 3 },
                { model2Id: 1, model1Id: 5 },
              ]);
            });
        });

        it('should unrelate using two parents and a subquery', () => {
          return Model2.relatedQuery('model2Relation1')
            .for(Model2.query().findByIds([1, 2]))
            .unrelate()
            .whereIn('Model1.id', [4, 6])
            .then((numDeleted) => {
              expect(numDeleted).toBe(2);
              return session.knex('Model1Model2').orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(2);
              expect(rows).toContainSubset([
                { model2Id: 1, model1Id: 3 },
                { model2Id: 1, model1Id: 5 },
              ]);
            });
        });

        it('should unrelate multiple', () => {
          return Model2.relatedQuery('model2Relation1')
            .for(1)
            .unrelate()
            .where('model1Prop1', '>', 'blaa 1')
            .then((numDeleted) => {
              expect(numDeleted).toBe(2);
              return session.knex('Model1Model2').orderBy('id');
            })
            .then((rows) => {
              expect(rows).toHaveLength(2);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 3)).toHaveLength(1);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 4)).toHaveLength(0);
              expect(rows.filter((it) => it.model2Id === 1 && it.model1Id === 5)).toHaveLength(0);
              expect(rows.filter((it) => it.model2Id === 2 && it.model1Id === 6)).toHaveLength(1);
            });
        });

        it('should fail if arguments are given', () => {
          return Model2.query()
            .findById(1)
            .then((model) => {
              return model.$relatedQuery('model2Relation1').unrelate([1, 2]);
            })
            .then(() => {
              throw new Error('should not get here');
            })
            .catch((err) => {
              expect(err.message).toBe(
                `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
              );
            });
        });
      });
    });
  });
};
