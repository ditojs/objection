const { expect } = require('chai');

module.exports = (session) => {
  // Owner models that were never saved, or whose insert didn't return an id.
  describe('writes through owner models without a key (#568)', () => {
    let Model1;

    beforeEach(async () => {
      Model1 = session.models.Model1;

      await session.populate([
        { id: 1, model1Prop1: 'related' },
        { id: 2, model1Prop1: 'owner', model1Relation2: [{ idCol: 1, model2Prop1: 'related' }] },
      ]);
    });

    const createOwner = () => Model1.fromJson({ model1Prop1: 'unsaved' });

    const expectError = async (query, verb, relationName) => {
      const err = await query.catch((err) => err);
      expect(err.message).to.equal(
        `Model1.relationMappings.${relationName}: can't ${verb}() related rows, as the owner model has no value for "Model1.id".`,
      );
    };

    const getRowCounts = async () => {
      const { knex } = session;
      const counts = await Promise.all(
        ['Model1', 'model2', 'Model1Model2'].map((table) =>
          knex(table).count('* as count').first(),
        ),
      );
      return counts.map(({ count }) => Number(count));
    };

    for (const verb of ['insert', 'relate']) {
      describe(`${verb}()`, () => {
        // Rows to insert or ids to relate, of Model1 or Model2:
        const input = (prop) => (verb === 'insert' ? { [prop]: 'new' } : 1);

        it('belongs to one relation', async () => {
          const counts = await getRowCounts();
          const owner = createOwner();
          await expectError(
            owner.$relatedQuery('model1Relation1')[verb](input('model1Prop1')),
            verb,
            'model1Relation1',
          );
          expect(owner.model1Id).to.equal(undefined);
          expect(await getRowCounts()).to.eql(counts);
        });

        it('has many relation', async () => {
          const counts = await getRowCounts();
          await expectError(
            createOwner().$relatedQuery('model1Relation2')[verb](input('model2Prop1')),
            verb,
            'model1Relation2',
          );
          expect(await getRowCounts()).to.eql(counts);
        });

        it('many to many relation', async () => {
          const counts = await getRowCounts();
          await expectError(
            createOwner().$relatedQuery('model1Relation3')[verb](input('model2Prop1')),
            verb,
            'model1Relation3',
          );
          expect(await getRowCounts()).to.eql(counts);
        });

        it('belongs to one relation with several owners, one without a key', async () => {
          const counts = await getRowCounts();
          const owners = [await Model1.query().findById(2), createOwner()];
          await expectError(
            Model1.relatedQuery('model1Relation1').for(owners)[verb](input('model1Prop1')),
            verb,
            'model1Relation1',
          );
          expect(owners[0].model1Id).to.equal(null);
          expect(await getRowCounts()).to.eql(counts);
          expect((await Model1.query().findById(2)).model1Id).to.equal(null);
        });
      });
    }
  });
};
