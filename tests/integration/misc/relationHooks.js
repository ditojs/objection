import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Model, snakeCaseMappers } from 'objection';

export default (session) => {
  describe('relation hooks', () => {
    describe('beforeInsert', () => {
      class Model1 extends Model {
        static get tableName() {
          return 'Model1';
        }

        static get relationMappings() {
          return {
            model1Relation1: {
              relation: Model.BelongsToOneRelation,
              modelClass: Model1,
              join: {
                from: 'Model1.model1Id',
                to: 'Model1.id',
              },
              beforeInsert(model, ctx, owner) {
                model.model1Prop2 = ctx.belongsToOneValue;
                if (ctx.owners) {
                  ctx.owners.push({
                    relation: 'model1Relation1',
                    model,
                    owner,
                    ownerId: owner && owner.id,
                  });
                }
              },
            },

            model1Relation1Inverse: {
              relation: Model.HasOneRelation,
              modelClass: Model1,
              join: {
                from: 'Model1.id',
                to: 'Model1.model1Id',
              },
            },

            model1Relation2: {
              relation: Model.HasManyRelation,
              modelClass: Model2,
              join: {
                from: 'Model1.id',
                to: 'model2.model1_id',
              },
              beforeInsert(model, ctx, owner) {
                model.model2Prop2 = ctx.hasManyValue;
                if (ctx.owners) {
                  ctx.owners.push({
                    relation: 'model1Relation2',
                    model,
                    owner,
                    ownerId: owner && owner.id,
                  });
                }
              },
            },

            model1Relation3: {
              relation: Model.ManyToManyRelation,
              modelClass: Model2,
              join: {
                from: 'Model1.id',
                through: {
                  from: 'Model1Model2.model1Id',
                  to: 'Model1Model2.model2Id',
                  extra: ['extra1', 'extra2'],
                  beforeInsert(model, ctx) {
                    model.extra2 = ctx.manyToManyJoinValue;
                  },
                },
                to: 'model2.id_col',
              },
              beforeInsert(model, ctx, owner) {
                model.model2Prop2 = ctx.manyToManyValue;
                if (ctx.owners) {
                  ctx.owners.push({
                    relation: 'model1Relation3',
                    model,
                    owner,
                    ownerId: owner && owner.id,
                  });
                }
              },
            },
          };
        }
      }

      class Model2 extends Model {
        static get tableName() {
          return 'model2';
        }

        static get idColumn() {
          return 'id_col';
        }

        static get columnNameMappers() {
          return snakeCaseMappers();
        }

        static get relationMappings() {
          return {
            model2Relation1: {
              relation: Model.ManyToManyRelation,
              modelClass: Model1,
              join: {
                from: 'model2.id_col',
                through: {
                  from: 'Model1Model2.model2Id',
                  to: 'Model1Model2.model1Id',
                  extra: { aliasedExtra: 'extra3' },
                },
                to: 'Model1.id',
              },
            },

            model2Relation2: {
              relation: Model.HasOneThroughRelation,
              modelClass: Model1,
              join: {
                from: 'model2.id_col',
                through: {
                  from: 'Model1Model2One.model2Id',
                  to: 'Model1Model2One.model1Id',
                },
                to: 'Model1.id',
              },
            },
          };
        }
      }

      beforeAll(() => {
        Model1.knex(session.knex);
        Model2.knex(session.knex);
      });

      beforeEach(() => {
        return session.populate([
          {
            model1Prop1: 'root',
          },
        ]);
      });

      describe('$relatedQuery', () => {
        let root;

        beforeEach(() => {
          return Model1.query()
            .findOne({ model1Prop1: 'root' })
            .then((model) => {
              root = model;
            });
        });

        it('belongs to one relation', () => {
          return root
            .$relatedQuery('model1Relation1')
            .insert({ model1Prop1: 'new' })
            .context({ belongsToOneValue: 42 })
            .then((model) => {
              return session.knex(Model1.getTableName()).where({ model1Prop1: 'new' }).first();
            })
            .then((row) => {
              expect(row.model1Prop2).toBe(42);
            });
        });

        it('has many relation', () => {
          return root
            .$relatedQuery('model1Relation2')
            .insert({ model2Prop1: 'new' })
            .context({ hasManyValue: 100 })
            .then((model) => {
              return session.knex(Model2.getTableName()).where({ model2_prop1: 'new' }).first();
            })
            .then((row) => {
              expect(row.model2_prop2).toBe(100);
            });
        });

        it('many to many relation (insert)', () => {
          return root
            .$relatedQuery('model1Relation3')
            .insert({ model2Prop1: 'new' })
            .context({
              manyToManyValue: 7,
              manyToManyJoinValue: 'Hello',
            })
            .then((model) => {
              return session.knex(Model2.getTableName()).where({ model2_prop1: 'new' }).first();
            })
            .then((row) => {
              expect(row.model2_prop2).toBe(7);
              return session.knex('Model1Model2');
            })
            .then((rows) => {
              expect(rows.length).toBe(1);
              expect(rows[0].extra2).toBe('Hello');
            });
        });

        it('many to many relation (relate)', () => {
          return Model2.query()
            .insert({ model2Prop1: 'rel' })
            .then((model) => {
              return root.$relatedQuery('model1Relation3').relate(model.idCol).context({
                manyToManyJoinValue: 'Extra',
              });
            })
            .then(() => {
              return session.knex('Model1Model2');
            })
            .then((rows) => {
              expect(rows.length).toBe(1);
              expect(rows[0].extra2).toBe('Extra');
            });
        });

        it('insertGraph', () => {
          return Model1.query()
            .context({
              belongsToOneValue: 1,
              hasManyValue: 2,
              manyToManyValue: 3,
              manyToManyJoinValue: 4,
            })
            .insertGraph({
              model1Prop1: 'parent',

              model1Relation1: {
                model1Prop1: 'child1',
              },

              model1Relation2: [
                {
                  model2Prop1: 'child2',
                },
                {
                  model2Prop1: 'child3',
                },
              ],

              model1Relation3: [
                {
                  model2Prop1: 'child4',
                },
                {
                  model2Prop1: 'child5',
                },
              ],
            })
            .then(() => {
              return Model1.query()
                .findOne({ model1Prop1: 'parent' })
                .withGraphFetched('[model1Relation1, model1Relation2, model1Relation3]')
                .then((model) => {
                  expect(model).toContainSubset({
                    model1Prop1: 'parent',

                    model1Relation1: {
                      model1Prop1: 'child1',
                      model1Prop2: 1,
                    },

                    model1Relation2: [
                      {
                        model2Prop1: 'child2',
                        model2Prop2: 2,
                      },
                      {
                        model2Prop1: 'child3',
                        model2Prop2: 2,
                      },
                    ],

                    model1Relation3: [
                      {
                        model2Prop1: 'child4',
                        model2Prop2: 3,
                        extra2: '4',
                      },
                      {
                        model2Prop1: 'child5',
                        model2Prop2: 3,
                        extra2: '4',
                      },
                    ],
                  });
                });
            });
        });

        it('upsertGraph', () => {
          return Model1.query()
            .insertGraph({
              model1Prop1: 'parent',

              model1Relation1: null,

              model1Relation2: [
                {
                  model2Prop1: 'child2',
                },
              ],

              model1Relation3: [
                {
                  model2Prop1: 'child5',
                },
              ],
            })
            .then((model) => {
              return Model1.query()
                .context({
                  belongsToOneValue: 1,
                  hasManyValue: 2,
                  manyToManyValue: 3,
                  manyToManyJoinValue: 4,
                })
                .upsertGraph({
                  id: model.id,
                  model1Prop1: 'parent',

                  model1Relation1: {
                    model1Prop1: 'child1',
                  },

                  model1Relation2: [
                    {
                      idCol: model.model1Relation2[0].idCol,
                      model2Prop1: 'child2',
                    },
                    {
                      model2Prop1: 'child3',
                    },
                  ],

                  model1Relation3: [
                    {
                      model2Prop1: 'child4',
                    },
                    {
                      idCol: model.model1Relation3[0].idCol,
                      model2Prop1: 'child5',
                    },
                  ],
                });
            })
            .then(() => {
              return Model1.query()
                .findOne({ model1Prop1: 'parent' })
                .withGraphFetched('[model1Relation1, model1Relation2, model1Relation3]')
                .then((model) => {
                  expect(model).toContainSubset({
                    model1Prop1: 'parent',

                    model1Relation1: {
                      model1Prop1: 'child1',
                      model1Prop2: 1,
                    },

                    model1Relation2: [
                      {
                        model2Prop1: 'child2',
                        model2Prop2: null,
                      },
                      {
                        model2Prop1: 'child3',
                        model2Prop2: 2,
                      },
                    ],

                    model1Relation3: [
                      {
                        model2Prop1: 'child4',
                        model2Prop2: 3,
                        extra2: '4',
                      },
                      {
                        model2Prop1: 'child5',
                        model2Prop2: null,
                        extra2: null,
                      },
                    ],
                  });
                });
            });
        });
      });

      describe('owner argument', () => {
        let root;
        let owners;

        beforeEach(() => {
          owners = [];
          return Model1.query()
            .findOne({ model1Prop1: 'root' })
            .then((model) => {
              root = model;
            });
        });

        it('$relatedQuery().insert() belongs to one relation', async () => {
          await root
            .$relatedQuery('model1Relation1')
            .insert({ model1Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBe(root);
        });

        it('$relatedQuery().insert() has many relation', async () => {
          await root
            .$relatedQuery('model1Relation2')
            .insert({ model2Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBe(root);
        });

        it('$relatedQuery().insert() many to many relation', async () => {
          await root
            .$relatedQuery('model1Relation3')
            .insert({ model2Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBe(root);
        });

        it('relatedQuery().for(model).insert()', async () => {
          await Model1.relatedQuery('model1Relation3')
            .for(root)
            .insert({ model2Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBe(root);
        });

        it('relatedQuery().for(id).insert() passes undefined', async () => {
          await Model1.relatedQuery('model1Relation2')
            .for(root.id)
            .insert({ model2Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBeUndefined();
        });

        it('relatedQuery().for([model1, model2]).insert() passes undefined', async () => {
          const other = await Model1.query().insert({ model1Prop1: 'other' });

          await Model1.relatedQuery('model1Relation1')
            .for([root, other])
            .insert({ model1Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBeUndefined();
        });

        it('$relatedQuery().insertGraph()', async () => {
          await root
            .$relatedQuery('model1Relation2')
            .insertGraph({ model2Prop1: 'new' })
            .context({ owners });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner).toBe(root);
        });

        it('insertGraph()', async () => {
          const parent = await Model1.query()
            .context({ owners })
            .insertGraph({
              model1Prop1: 'parent',
              model1Relation1: { model1Prop1: 'child1' },
              model1Relation2: [{ model2Prop1: 'child2' }],
              model1Relation3: [{ model2Prop1: 'child3' }],
            });

          const ownerOf = (relation) => owners.find((it) => it.relation === relation);

          expect(owners).toHaveLength(3);
          expect(ownerOf('model1Relation1').owner).toBe(parent);
          expect(ownerOf('model1Relation2').owner).toBe(parent);
          expect(ownerOf('model1Relation3').owner).toBe(parent);
          // The owner of a belongs to one relation is inserted after the related model.
          expect(ownerOf('model1Relation1').ownerId).toBeUndefined();
          // The owner of a has many relation is inserted before the related models.
          expect(ownerOf('model1Relation2').ownerId).toBe(parent.id);
        });

        it('upsertGraph()', async () => {
          await Model1.query()
            .context({ owners })
            .upsertGraph({
              id: root.id,
              model1Relation2: [{ model2Prop1: 'child' }],
            });

          expect(owners).toHaveLength(1);
          expect(owners[0].owner.id).toBe(root.id);
          expect(owners[0].ownerId).toBe(root.id);
        });
      });
    });
  });
};
