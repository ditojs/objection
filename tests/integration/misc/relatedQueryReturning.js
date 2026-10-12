import { describe, it, expect, beforeEach } from 'vitest';

export default (session) => {
  const { Model1, Model2 } = session.models;
  const hasReturning = session.isPostgres() || session.isMsSql() || session.isSqlite();

  describe('writes through to-one relation queries', () => {
    let owner;
    let inverseOwner;
    let throughOwner;
    let ownerWithout;

    beforeEach(async () => {
      await session.populate([
        {
          id: 1,
          model1Prop1: 'owner',
          model1Relation1: { id: 2, model1Prop1: 'parent' },
          model1Relation2: [
            {
              idCol: 1,
              model2Prop1: 'through',
              model2Relation2: { id: 3, model1Prop1: 'related' },
            },
          ],
        },
        { id: 4, model1Prop1: 'without' },
      ]);
      owner = await Model1.query().findById(1);
      inverseOwner = await Model1.query().findById(2);
      throughOwner = await Model2.query().findById(1);
      ownerWithout = await Model1.query().findById(4);
    });

    // A second row that has the same owner as the first one:
    const addSecondRow = () =>
      session.knex('Model1').insert({ id: 5, model1Id: 2, model1Prop1: 'second' });

    it('asFindQuery() in static hooks finds all rows that the write changes', async () => {
      await addSecondRow();
      let found;
      Model1.beforeUpdate = async ({ asFindQuery }) => {
        found = await asFindQuery();
      };
      try {
        const result = await inverseOwner
          .$relatedQuery('model1Relation1Inverse')
          .patch({ model1Prop1: 'patched' });
        expect(result).toBe(2);
        expect(found.map((it) => it.id).sort()).toEqual([1, 5]);
      } finally {
        delete Model1.beforeUpdate;
      }
    });

    if (hasReturning) {
      const relations = [
        ['belongs to one', () => owner, 'model1Relation1', 2],
        ['has one', () => inverseOwner, 'model1Relation1Inverse', 1],
        ['has one through', () => throughOwner, 'model2Relation2', 3],
      ];

      for (const [title, getOwner, relationName, id] of relations) {
        describe(title, () => {
          it('patch() resolves to one model', async () => {
            const result = await getOwner()
              .$relatedQuery(relationName)
              .patch({ model1Prop1: 'patched' })
              .returning('*');
            expect(result).toBeInstanceOf(Model1);
            expect(result).toMatchObject({ id, model1Prop1: 'patched' });
          });

          it('update() resolves to one model', async () => {
            const result = await getOwner()
              .$relatedQuery(relationName)
              .update({ model1Prop1: 'updated' })
              .returning('*');
            expect(result).toBeInstanceOf(Model1);
            expect(result).toMatchObject({ id, model1Prop1: 'updated' });
          });

          // knex has no `returning` for deletes on SQLite.
          if (!session.isSqlite()) {
            it('delete() resolves to one model', async () => {
              const result = await getOwner().$relatedQuery(relationName).delete().returning('*');
              expect(result).toBeInstanceOf(Model1);
              expect(result).toMatchObject({ id });
            });
          }

          it('returning() before the write resolves to one model', async () => {
            const result = await getOwner()
              .$relatedQuery(relationName)
              .returning('*')
              .patch({ model1Prop1: 'patched' });
            expect(result).toMatchObject({ id, model1Prop1: 'patched' });
          });

          it('the static relatedQuery() resolves to an array', async () => {
            const OwnerClass = getOwner().constructor;
            const result = await OwnerClass.relatedQuery(relationName)
              .for(getOwner())
              .patch({ model1Prop1: 'patched' })
              .returning('*');
            expect(result).toEqual([expect.objectContaining({ id, model1Prop1: 'patched' })]);
          });
        });
      }

      it('resolves to all rows for several related rows, like the find', async () => {
        await addSecondRow();
        const result = await inverseOwner
          .$relatedQuery('model1Relation1Inverse')
          .patch({ model1Prop1: 'patched' })
          .returning('*');
        expect(result.map((it) => it.id).sort()).toEqual([1, 5]);
      });

      it('static afterUpdate() hooks get the one model', async () => {
        let hookResult;
        Model1.afterUpdate = ({ result }) => {
          hookResult = result;
        };
        try {
          await owner
            .$relatedQuery('model1Relation1')
            .patch({ model1Prop1: 'patched' })
            .returning('*');
          expect(hookResult).toBeInstanceOf(Model1);
          expect(hookResult).toMatchObject({ id: 2, model1Prop1: 'patched' });
        } finally {
          delete Model1.afterUpdate;
        }
      });

      it('resolves to undefined without a related row', async () => {
        const result = await ownerWithout
          .$relatedQuery('model1Relation1')
          .patch({ model1Prop1: 'patched' })
          .returning('*');
        expect(result).toBeUndefined();
      });

      it('resolves to the number of rows without returning()', async () => {
        const result = await owner
          .$relatedQuery('model1Relation1')
          .patch({ model1Prop1: 'patched' });
        expect(result).toBe(1);
      });
    }
  });
};
