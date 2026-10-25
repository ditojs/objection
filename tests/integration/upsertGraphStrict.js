import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundError } from 'objection';

export default (session) => {
  const Model1 = session.unboundModels.Model1;

  describe('upsertGraph (strict)', () => {
    describe('relation names', () => {
      beforeEach(() => {
        return session.populate([{ id: 1, model1Prop1: 'root 1' }]);
      });

      it('should throw for a relation that the model does not have', async () => {
        for (const key of ['model1Relation9', 'model1Relation2.model2Relation9']) {
          const relationName = key.split('.').pop();
          const error = await Model1.query(session.knex)
            .upsertGraph({ id: 1 }, { strict: true, relations: { [key]: { removed: 'preserve' } } })
            .catch((err) => err);

          expect(error.type).toBe('InvalidGraph');
          expect(error.message).toContain(`"${relationName}"`);
          expect(error.message).toContain(`"${key}"`);
        }
      });

      it('should throw for insertGraph() too', async () => {
        const error = await Model1.query(session.knex)
          .insertGraph(
            { model1Prop1: 'new' },
            { strict: true, relations: { model1Relation9: { added: 'relate' } } },
          )
          .catch((err) => err);

        expect(error.type).toBe('InvalidGraph');
        expect(error.message).toContain('"model1Relation9"');
      });

      it('should accept * and ^, and relations that the graph does not give', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 1 },
          {
            strict: true,
            relations: {
              '*': { removed: 'preserve' },
              'model1Relation1.^': { removed: 'preserve' },
              'model1Relation2.model2Relation1.*': { kept: 'update' },
            },
          },
        );
      });
    });

    describe('the same results as the old options', () => {
      async function upsert(graph, options) {
        await session.populate([
          { id: 1, model1Prop1: 'root 1', model1Prop2: 1 },
          {
            id: 2,
            model1Prop1: 'root 2',
            model1Prop2: 2,
            model1Relation1: { id: 3, model1Prop1: 'belongsToOne', model1Prop2: 3 },
            model1Relation2: [
              { idCol: 1, model2Prop1: 'hasMany 1' },
              { idCol: 2, model2Prop1: 'hasMany 2' },
            ],
            model1Relation3: [{ idCol: 3, model2Prop1: 'manyToMany 1' }],
          },
        ]);

        try {
          await Model1.query(session.knex).upsertGraph(graph, options);
        } catch (err) {
          return { error: err.message };
        }

        return {
          model1: await session.knex('Model1').orderBy('id'),
          model2: await session.knex('model2').orderBy('id_col'),
          model1Model2: await session
            .knex('Model1Model2')
            .select('model1Id', 'model2Id')
            .orderBy(['model1Id', 'model2Id']),
        };
      }

      for (const [description, graph, oldOptions, relations] of [
        [
          'unrelate',
          { id: 2, model1Relation2: [{ idCol: 1 }] },
          { unrelate: 'model1Relation2' },
          { model1Relation2: { removed: 'unrelate' } },
        ],
        [
          'noDelete',
          { id: 2, model1Relation2: [{ idCol: 1 }] },
          { noDelete: 'model1Relation2' },
          { model1Relation2: { removed: 'preserve' } },
        ],
        [
          'relate',
          { id: 1, model1Relation3: [{ idCol: 3 }, { idCol: 1 }] },
          { relate: 'model1Relation3' },
          { model1Relation3: { added: 'relate' } },
        ],
        [
          'update',
          { id: 2, model1Relation1: { id: 3, model1Prop1: 'updated' } },
          { update: 'model1Relation1' },
          { model1Relation1: { kept: 'update' } },
        ],
      ]) {
        it(`should write the same rows with ${description}`, async () => {
          // `update()` sets the defaults of the props that a graph leaves out,
          // where `patch()` keeps their values:
          Model1.$$jsonSchema = {
            type: 'object',
            properties: { model1Prop2: { type: 'integer', default: 99 } },
          };

          try {
            const expected = await upsert(graph, oldOptions);
            const result = await upsert(graph, { strict: true, relations });
            const defaultResult = await upsert(graph, {});

            expect(expected.error).toBeUndefined();
            expect(result).toEqual(expected);
            // The options make a difference for these graphs:
            expect(defaultResult).not.toEqual(expected);
          } finally {
            delete Model1.$$jsonSchema;
            delete Model1.$$validator;
          }
        });
      }
    });

    describe('writes', () => {
      beforeEach(() => {
        return session.populate([
          { id: 1, model1Prop1: 'root 1' },
          {
            id: 2,
            model1Prop1: 'root 2',
            // A chain of BelongsToOneRelations:
            model1Relation1: {
              id: 3,
              model1Prop1: 'belongsToOne',
              model1Relation1: { id: 4, model1Prop1: 'belongsToOne 2' },
            },
            model1Relation2: [
              { idCol: 1, model2Prop1: 'hasMany 1' },
              { idCol: 2, model2Prop1: 'hasMany 2' },
            ],
          },
        ]);
      });

      const getRows = async (table, idColumn) =>
        (await session.knex(table).orderBy(idColumn)).map((row) => row[idColumn]);
      const getModel1 = (id) => session.knex('Model1').where('id', id).first();

      it('should relate existing rows and insert missing ones with relateOrInsert', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 1, model1Relation3: [{ idCol: 1 }, { idCol: 100, model2Prop1: 'new' }] },
          { strict: true, relations: { model1Relation3: { added: 'relateOrInsert' } } },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2, 100]);
        const joinRows = await session.knex('Model1Model2').orderBy('model2Id');
        expect(joinRows.map((row) => [row.model1Id, row.model2Id])).toEqual([
          [1, 1],
          [1, 100],
        ]);
      });

      it('should let a later entry override a setting of *', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 2, model1Relation1: null, model1Relation2: [{ idCol: 1 }] },
          {
            strict: true,
            relations: { '*': { removed: 'preserve' }, model1Relation2: { removed: 'delete' } },
          },
        );

        expect((await getModel1(2)).model1Id).toBe(3);
        expect(await getRows('model2', 'id_col')).toEqual([1]);
      });

      it('should let a later * override a setting of an earlier entry', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 2, model1Relation2: [{ idCol: 1 }] },
          {
            strict: true,
            relations: { model1Relation2: { removed: 'delete' }, '*': { removed: 'preserve' } },
          },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2]);
      });

      it('should apply a recursive key at every level', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 2, model1Relation1: { id: 3, model1Relation1: null } },
          { strict: true, relations: { 'model1Relation1.^': { removed: 'unrelate' } } },
        );

        expect((await getModel1(3)).model1Id).toBe(null);
        expect(await getRows('Model1', 'id')).toEqual([1, 2, 3, 4]);
      });

      it('should not write the root with root: { kept: preserve }', async () => {
        await Model1.query(session.knex).upsertGraph(
          { id: 1, model1Prop1: 'changed', model1Relation3: [{ model2Prop1: 'new' }] },
          { strict: true, root: { kept: 'preserve' } },
        );

        expect((await getModel1(1)).model1Prop1).toBe('root 1');
        expect(await getRows('model2', 'id_col')).toHaveLength(3);
      });

      it('should insert a missing root with root: { added: insert }', async () => {
        const graph = { id: 50, model1Prop1: 'new root' };
        const error = await Model1.query(session.knex)
          .upsertGraph(graph, { strict: true })
          .catch((err) => err);

        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.message).toContain('root model (id=50) does not exist');

        await Model1.query(session.knex).upsertGraph(graph, {
          strict: true,
          root: { added: 'insert' },
        });

        expect((await getModel1(50)).model1Prop1).toBe('new root');
      });

      it('should relate rows in insertGraph() with added: relate', async () => {
        const inserted = await Model1.query(session.knex).insertGraph(
          { model1Prop1: 'new', model1Relation3: [{ idCol: 1 }] },
          { strict: true, relations: { model1Relation3: { added: 'relate' } } },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2]);
        const joinRows = await session.knex('Model1Model2');
        expect(joinRows.map((row) => [row.model1Id, row.model2Id])).toEqual([[inserted.id, 1]]);
      });

      it('should insert rows with ids in insertGraph() by default', async () => {
        await Model1.query(session.knex).insertGraph(
          { model1Prop1: 'new', model1Relation3: [{ idCol: 100, model2Prop1: 'new' }] },
          { strict: true },
        );

        expect(await getRows('model2', 'id_col')).toEqual([1, 2, 100]);
      });
    });
  });
};
