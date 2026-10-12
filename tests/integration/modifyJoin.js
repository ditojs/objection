import { describe, it, expect, beforeAll } from 'vitest';
import { sortBy } from '../../testUtils/testUtils.js';

export default (session) => {
  const { Model1 } = session.models;

  describe('modifyJoin()', () => {
    beforeAll(() => {
      return session.populate([
        {
          id: 1,
          model1Prop2: 10,

          model1Relation1: {
            id: 2,
            model1Prop2: 5,

            model1Relation2: [
              { idCol: 5, model2Prop2: 1 },
              { idCol: 6, model2Prop2: 9 },
            ],
          },

          model1Relation2: [
            { idCol: 1, model2Prop2: 5 },
            { idCol: 2, model2Prop2: 20 },
          ],

          model1Relation3: [
            { idCol: 3, extra1: 'x' },
            { idCol: 4, extra1: 'y' },
          ],
        },
      ]);
    });

    // Keep the related models whose `model2Prop2` is greater than the
    // `model1Prop2` of their owner.
    const greaterThanOwner = (join, { owner, related }) => {
      join.andOn(`${related}.model2_prop2`, '>', `${owner}.model1Prop2`);
    };

    const getIds = (models) => models.map((it) => it.idCol).sort();

    describe('joinRelated()', () => {
      it('should modify the join of a has many relation', async () => {
        const aliases = [];
        const models = await Model1.query()
          .select('model1Relation2.id_col as idCol')
          .joinRelated('model1Relation2')
          .modifyJoin('model1Relation2', (join, args) => {
            aliases.push(args);
            greaterThanOwner(join, args);
          })
          .where('Model1.id', 1);

        expect(aliases).toEqual([{ owner: 'Model1', related: 'model1Relation2' }]);
        expect(getIds(models)).toEqual([2]);
      });

      it('should modify the join of a belongs to one relation', async () => {
        const models = await Model1.query()
          .select('Model1.id', 'model1Relation1.id as relatedId')
          .leftJoinRelated('model1Relation1')
          .modifyJoin('model1Relation1', (join, { owner, related }) => {
            join.andOn(`${related}.model1Prop2`, '>', `${owner}.model1Prop2`);
          })
          .where('Model1.id', 1);

        expect(models.map((it) => it.relatedId)).toEqual([null]);
      });

      it('should modify the join of a many to many relation with the join table alias', async () => {
        const aliases = [];
        const models = await Model1.query()
          .select('model1Relation3.id_col as idCol')
          .joinRelated('model1Relation3')
          .modifyJoin('model1Relation3', (join, args) => {
            aliases.push(args);
            join.andOnVal(`${args.joinTable}.extra1`, 'x');
          })
          .where('Model1.id', 1);

        expect(aliases).toEqual([
          { owner: 'Model1', related: 'model1Relation3', joinTable: 'model1Relation3_join' },
        ]);
        expect(getIds(models)).toEqual([3]);
      });

      it('should leave out the join table rows that a many to many modifier excludes in outer joins', async () => {
        const models = await Model1.query()
          .select('model1Relation3.id_col as idCol')
          .leftJoinRelated('model1Relation3')
          .modifyJoin('model1Relation3', (join, { joinTable }) => {
            join.andOnVal(`${joinTable}.extra1`, 'x');
          })
          .where('Model1.id', 1);

        expect(models.map((it) => it.idCol)).toEqual([3]);
      });

      it('should keep the owners without matching rows of a modified many to many relation in outer joins', async () => {
        const models = await Model1.query()
          .select('Model1.id', 'model1Relation3.id_col as idCol')
          .leftJoinRelated('model1Relation3(lowIds)')
          .modifiers({ lowIds: (query) => query.where('id_col', '<', 4) })
          .modifyJoin('model1Relation3', (join, { joinTable }) => {
            join.andOnVal(`${joinTable}.extra1`, 'y');
          })
          .whereIn('Model1.id', [1, 2])
          .orderBy('Model1.id');

        expect(models.map(({ id, idCol }) => ({ id, idCol }))).toEqual([
          { id: 1, idCol: null },
          { id: 2, idCol: null },
        ]);
      });

      it('should keep the related rows without join table rows in right joins of a modified many to many relation', async () => {
        const models = await Model1.query()
          .select('Model1.id', 'model1Relation3.id_col as idCol')
          .rightJoinRelated('model1Relation3')
          .modifyJoin('model1Relation3', (join, { joinTable }) => {
            join.andOnVal(`${joinTable}.extra1`, 'x');
          });

        expect(sortBy(models, ['idCol']).map(({ id, idCol }) => ({ id, idCol }))).toEqual([
          { id: null, idCol: 1 },
          { id: null, idCol: 2 },
          { id: 1, idCol: 3 },
          { id: null, idCol: 4 },
          { id: null, idCol: 5 },
          { id: null, idCol: 6 },
        ]);
      });

      it('should group the conditions of the modifiers', async () => {
        const models = await Model1.query()
          .select('Model1.id', 'model1Relation2.id_col as idCol')
          .joinRelated('model1Relation2')
          .modifyJoin('model1Relation2', (join, { related }) => {
            join.onVal(`${related}.model2_prop2`, 5).orOnVal(`${related}.model2_prop2`, 1);
          });

        expect(sortBy(models, ['idCol']).map(({ id, idCol }) => ({ id, idCol }))).toEqual([
          { id: 1, idCol: 1 },
          { id: 2, idCol: 5 },
        ]);
      });

      it('should group the conditions of the modifiers of a many to many relation', async () => {
        const models = await Model1.query()
          .select('Model1.id', 'model1Relation3.id_col as idCol')
          .joinRelated('model1Relation3')
          .modifyJoin('model1Relation3', (join, { joinTable }) => {
            join.onVal(`${joinTable}.extra1`, 'x').orOnVal(`${joinTable}.extra1`, 'y');
          });

        expect(sortBy(models, ['idCol']).map(({ id, idCol }) => ({ id, idCol }))).toEqual([
          { id: 1, idCol: 3 },
          { id: 1, idCol: 4 },
        ]);
      });

      it('should accept modifiers that add no conditions', async () => {
        const models = await Model1.query()
          .select('model1Relation3.id_col as idCol')
          .joinRelated('[model1Relation2, model1Relation3]')
          .modifyJoin('[model1Relation2, model1Relation3]', () => {})
          .where('model1Relation2.id_col', 1);

        expect(getIds(models)).toEqual([3, 4]);
      });

      it('should match the paths by the names of the aliases option', async () => {
        const aliases = [];
        const models = await Model1.query()
          .select('m.id_col as idCol')
          .joinRelated('model1Relation2', { aliases: { model1Relation2: 'm' } })
          .modifyJoin('m', (join, args) => {
            aliases.push(args);
            greaterThanOwner(join, args);
          })
          .where('Model1.id', 1);

        expect(aliases).toEqual([{ owner: 'Model1', related: 'm' }]);
        expect(getIds(models)).toEqual([2]);
      });

      it('should modify the joins of nested relations only', async () => {
        const aliases = [];
        const models = await Model1.query()
          .select('model1Relation1:model1Relation2.id_col as idCol')
          .joinRelated('[model1Relation2, model1Relation1.model1Relation2]')
          .modifyJoin('model1Relation1.model1Relation2', (join, args) => {
            aliases.push(args);
            join.andOnVal(`${args.related}.model2_prop2`, '>', 5);
          })
          .where('Model1.id', 1);

        expect(aliases).toEqual([
          { owner: 'model1Relation1', related: 'model1Relation1:model1Relation2' },
        ]);
        // Two `model1Relation2` rows times one nested row:
        expect(getIds(models)).toEqual([6, 6]);
      });

      it('should match the paths by the aliases of the relations', async () => {
        const aliases = [];
        const models = await Model1.query()
          .select('m.id_col as idCol')
          .joinRelated('model1Relation2 as m')
          .modifyJoin('m', (join, args) => {
            aliases.push(args);
            greaterThanOwner(join, args);
          })
          .modifyJoin('model1Relation2', () => {
            throw new Error('should not be called');
          })
          .where('Model1.id', 1);

        expect(aliases).toEqual([{ owner: 'Model1', related: 'm' }]);
        expect(getIds(models)).toEqual([2]);
      });

      it('should call all modifiers of a path', async () => {
        const models = await Model1.query()
          .select('model1Relation2.id_col as idCol')
          .joinRelated('model1Relation2')
          .modifyJoin('[model1Relation1, model1Relation2]', greaterThanOwner)
          .modifyJoin('model1Relation2', (join, { related }) => {
            join.andOnVal(`${related}.model2_prop2`, '<', 10);
          })
          .where('Model1.id', 1);

        expect(models).toEqual([]);
      });
    });

    describe('withGraphJoined()', () => {
      it('should modify the join of a has many relation', async () => {
        const aliases = [];
        const model = await Model1.query()
          .withGraphJoined('model1Relation2')
          .modifyJoin('model1Relation2', (join, args) => {
            aliases.push(args);
            greaterThanOwner(join, args);
          })
          .findById(1);

        expect(aliases).toEqual([{ owner: 'Model1', related: 'model1Relation2' }]);
        expect(getIds(model.model1Relation2)).toEqual([2]);
      });

      it('should modify the join of a belongs to one relation', async () => {
        const model = await Model1.query()
          .withGraphJoined('model1Relation1')
          .modifyJoin('model1Relation1', (join, { owner, related }) => {
            join.andOn(`${related}.model1Prop2`, '>', `${owner}.model1Prop2`);
          })
          .findById(1);

        expect(model.model1Relation1).toBe(null);
      });

      it('should modify the join of a many to many relation with the join table alias', async () => {
        const aliases = [];
        const model = await Model1.query()
          .withGraphJoined('model1Relation3')
          .modifyJoin('model1Relation3', (join, args) => {
            aliases.push(args);
            join.andOnVal(`${args.joinTable}.extra1`, 'x');
          })
          .findById(1);

        expect(aliases).toEqual([
          { owner: 'Model1', related: 'model1Relation3', joinTable: 'model1Relation3_join' },
        ]);
        expect(getIds(model.model1Relation3)).toEqual([3]);
      });

      it('should select the join table extras of a modified many to many relation', async () => {
        const model = await Model1.query()
          .withGraphJoined('model1Relation3(lowIds)')
          .modifiers({ lowIds: (query) => query.where('id_col', '<', 4) })
          .modifyJoin('model1Relation3', (join, { joinTable }) => {
            join.andOnVal(`${joinTable}.extra1`, 'x');
          })
          .findById(1);

        expect(model.model1Relation3.map(({ idCol, extra1 }) => ({ idCol, extra1 }))).toEqual([
          { idCol: 3, extra1: 'x' },
        ]);
      });

      it('should match the paths by the relation names with the aliases option', async () => {
        const aliases = [];
        const model = await Model1.query()
          .withGraphJoined('model1Relation2', { aliases: { model1Relation2: 'm' } })
          .modifyJoin('model1Relation2', (join, args) => {
            aliases.push(args);
            greaterThanOwner(join, args);
          })
          .findById(1);

        expect(aliases).toEqual([{ owner: 'Model1', related: 'm' }]);
        expect(getIds(model.model1Relation2)).toEqual([2]);
      });

      it('should modify the joins of nested relations only', async () => {
        const model = await Model1.query()
          .withGraphJoined('[model1Relation2, model1Relation1.model1Relation2]')
          .modifyJoin('model1Relation1.model1Relation2', greaterThanOwner)
          .findById(1);

        expect(getIds(model.model1Relation2)).toEqual([1, 2]);
        expect(getIds(model.model1Relation1.model1Relation2)).toEqual([6]);
      });

      it('should match the paths by the aliases of the relations', async () => {
        const model = await Model1.query()
          .withGraphJoined('model1Relation2 as m')
          .modifyJoin('m', greaterThanOwner)
          .findById(1);

        expect(getIds(model.m)).toEqual([2]);
      });

      it('should not modify withGraphFetched()', async () => {
        const model = await Model1.query()
          .withGraphFetched('model1Relation2')
          .modifyJoin('model1Relation2', () => {
            throw new Error('should not be called');
          })
          .findById(1);

        expect(getIds(model.model1Relation2)).toEqual([1, 2]);
      });
    });

    it('should be kept by clone()', async () => {
      const query = Model1.query()
        .select('model1Relation2.id_col as idCol')
        .joinRelated('model1Relation2')
        .modifyJoin('model1Relation2', greaterThanOwner)
        .where('Model1.id', 1);

      expect(getIds(await query.clone())).toEqual([2]);
    });
  });
};
