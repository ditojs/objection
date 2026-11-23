import { describe, it, expect, beforeEach } from 'vitest';

export default (session) => {
  // Writes through relations, filtered by the rows that `joinRelated()` joins.
  describe('relation writes filtered through joinRelated() (#560)', () => {
    let Model1;
    let owner;

    beforeEach(async () => {
      Model1 = session.models.Model1;

      await session.populate([
        {
          id: 1,
          model1Prop1: 'owner',
          model1Relation1: { id: 2, model1Prop1: 'parent' },
          model1Relation2: [
            { idCol: 1, model2Prop1: 'a', model2Relation1: [{ id: 3, model1Prop1: 'x' }] },
            { idCol: 2, model2Prop1: 'b', model2Relation1: [{ id: 4, model1Prop1: 'y' }] },
          ],
          model1Relation3: [
            { idCol: 3, model2Prop1: 'c', model2Relation3: [{ id: 1, model3Prop1: 'tag' }] },
            { idCol: 4, model2Prop1: 'd' },
          ],
        },
      ]);

      owner = await Model1.query().findById(1);
    });

    const getModel2Rows = () =>
      session.knex('model2').orderBy('id_col').select('id_col', 'model1_id', 'model2_prop1');

    it('many-to-many unrelate()', async () => {
      const numUnrelated = await owner
        .$relatedQuery('model1Relation3')
        .unrelate()
        .joinRelated('model2Relation3')
        .where('model2Relation3.model3Prop1', 'tag');

      expect(numUnrelated).toBe(1);
      expect(
        (await owner.$relatedQuery('model1Relation3').orderBy('id_col')).map((it) => it.idCol),
      ).toEqual([4]);
    });

    it('many-to-many patch()', async () => {
      const numPatched = await owner
        .$relatedQuery('model1Relation3')
        .patch({ model2Prop1: 'patched' })
        .joinRelated('model2Relation3')
        .where('model2Relation3.model3Prop1', 'tag');

      expect(numPatched).toBe(1);
      expect((await getModel2Rows()).map((row) => row.model2_prop1)).toEqual([
        'a',
        'b',
        'patched',
        'd',
      ]);
    });

    it('many-to-many delete()', async () => {
      const numDeleted = await owner
        .$relatedQuery('model1Relation3')
        .delete()
        .joinRelated('model2Relation3')
        .where('model2Relation3.model3Prop1', 'tag');

      expect(numDeleted).toBe(1);
      expect((await getModel2Rows()).map((row) => row.id_col)).toEqual([1, 2, 4]);
    });

    // knex only supports joins in updates on MySQL:
    it.skipIf(!session.isMySql())('has-many unrelate()', async () => {
      const numUnrelated = await owner
        .$relatedQuery('model1Relation2')
        .unrelate()
        .joinRelated('model2Relation1')
        .where('model2Relation1.model1Prop1', 'x');

      expect(numUnrelated).toBe(1);
      expect((await getModel2Rows()).map((row) => row.model1_id)).toEqual([null, 1, null, null]);
    });

    it('belongs-to-one unrelate()', async () => {
      const numUnrelated = await owner
        .$relatedQuery('model1Relation1')
        .unrelate()
        .joinRelated('model1Relation1Inverse as child')
        .where('child.model1Prop1', 'owner');

      expect(numUnrelated).toBe(1);
      expect((await Model1.query().findById(1)).model1Id).toBe(null);
    });
  });
};
