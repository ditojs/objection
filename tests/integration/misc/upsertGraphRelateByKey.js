import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() relating a BelongsToOneRelation model by its key alone', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'relate_key_person';
      }

      static get relationMappings() {
        return {
          parent: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'relate_key_person.parentId', to: 'relate_key_person.id' },
          },
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'relate_key_pet';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'relate_key_pet.ownerCode', to: 'relate_key_person.code' },
          },
        };
      }
    }

    beforeAll(() =>
      knex.schema
        .dropTableIfExists('relate_key_pet')
        .dropTableIfExists('relate_key_person')
        .createTable('relate_key_person', (table) => {
          table.integer('id').primary();
          table.string('code');
          table.string('label');
          table.integer('parentId');
        })
        .createTable('relate_key_pet', (table) => {
          table.integer('id').primary();
          table.string('ownerCode');
        }),
    );

    afterAll(() =>
      knex.schema.dropTableIfExists('relate_key_pet').dropTableIfExists('relate_key_person'),
    );

    beforeEach(async () => {
      await knex('relate_key_pet').delete();
      await knex('relate_key_person').delete();
      await knex('relate_key_person').insert([
        { id: 1, code: 'c1' },
        { id: 2, code: 'c2' },
      ]);
      await knex('relate_key_pet').insert([{ id: 1 }, { id: 2 }]);
    });

    const fetchOwnerCodes = async () =>
      (await knex('relate_key_pet').orderBy('id')).map(({ ownerCode }) => ownerCode);

    it('should write the key of the model to its owner', async () => {
      await Pet.query(knex).upsertGraph(
        { id: 1, owner: { code: 'c1', label: undefined } },
        { relate: true },
      );

      expect(await fetchOwnerCodes()).toEqual(['c1', null]);
    });

    it("should write the key without looking up the model's row", async () => {
      await Pet.query(knex).upsertGraph({ id: 1, owner: { code: 'zz' } }, { relate: true });

      expect(await fetchOwnerCodes()).toEqual(['zz', null]);
    });

    it('should leave out the other props of the model under noUpdate', async () => {
      await Pet.query(knex).upsertGraph(
        { id: 1, owner: { code: 'c1', label: 'l' } },
        { relate: true, noUpdate: true },
      );

      expect(await fetchOwnerCodes()).toEqual(['c1', null]);
      expect(await knex('relate_key_person').where('id', 1).first()).toMatchObject({
        label: null,
      });
    });

    for (const [title, graph, message] of [
      [
        'other props',
        { id: 1, owner: { code: 'c1', label: 'l' } },
        "the Person at 'owner' is related by its key alone, so its label can't be written",
      ],
      [
        'relations',
        { id: 1, owner: { code: 'c1', parent: { id: 2 } } },
        "the Person at 'owner' is related by its key alone, so its parent can't be written",
      ],
      [
        'a #id that a #ref{} refers to',
        [
          { id: 1, owner: { '#id': 'o', code: 'c1' } },
          { id: 2, ownerCode: '#ref{o.code}' },
        ],
        "the Person at '[0].owner' is related by its key alone, so it can't be referenced",
      ],
    ]) {
      it(`should reject a model with ${title} before any write`, async () => {
        await expect(
          Pet.query(knex).upsertGraph(graph, { relate: true, allowRefs: true }),
        ).rejects.toThrow(message);

        expect(await fetchOwnerCodes()).toEqual([null, null]);
      });
    }
  });
};
