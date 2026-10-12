import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Model, DBError, ValidationError } from 'objection';

export default (session) => {
  describe('upsertGraph() deleting the row of a BelongsToOneRelation', () => {
    const { knex } = session;

    class Pet extends Model {
      static get tableName() {
        return 'bt1_delete_pet';
      }
    }

    class Owner extends Model {
      static get tableName() {
        return 'bt1_delete_owner';
      }

      static get relationMappings() {
        return {
          pet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: { from: 'bt1_delete_owner.petId', to: 'bt1_delete_pet.id' },
          },
        };
      }
    }

    function createTables(createPetId) {
      return knex.schema
        .dropTableIfExists('bt1_delete_owner')
        .dropTableIfExists('bt1_delete_pet')
        .createTable('bt1_delete_pet', (table) => {
          table.integer('id').primary();
        })
        .createTable('bt1_delete_owner', (table) => {
          table.integer('id').primary();
          createPetId(table);
        });
    }

    // Replacing the row first points the owner to the new row and then
    // deletes the old one, so it works with every foreign key.
    function itShouldReplaceTheRow() {
      it('should point the owner to an inserted row and delete the old one', async () => {
        await Owner.query().upsertGraph({ id: 1, pet: { id: 2 } }, { insertMissing: true });

        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: 2 }]);
        expect(await knex('bt1_delete_pet')).toEqual([{ id: 2 }]);
      });

      it('should point the owner to a related row and delete the old one', async () => {
        await knex('bt1_delete_pet').insert({ id: 2 });
        await Owner.query().upsertGraph({ id: 1, pet: { id: 2 } }, { relate: true });

        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: 2 }]);
        expect(await knex('bt1_delete_pet')).toEqual([{ id: 2 }]);
      });

      it('should keep the row when noInsert skips the replacement', async () => {
        await Owner.query().upsertGraph({ id: 1, pet: {} }, { noInsert: ['pet'] });

        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: 1 }]);
        expect(await knex('bt1_delete_pet')).toEqual([{ id: 1 }]);
      });
    }

    // Removing the row sets the owner's reference to null before deleting the
    // row, like `unrelate()`, whatever the owner's schema says.
    function itShouldRemoveTheReferenceBeforeTheRow() {
      it('should set the reference to null before deleting the row', async () => {
        await Owner.query().upsertGraph({ id: 1, pet: null });

        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: null }]);
        expect(await knex('bt1_delete_pet')).toEqual([]);
      });

      it('should set the reference to null before deleting a #delete row', async () => {
        await Owner.query().upsertGraph(
          { id: 1, pet: { id: 1, '#delete': true } },
          { allowMarkers: true },
        );

        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: null }]);
        expect(await knex('bt1_delete_pet')).toEqual([]);
      });

      it("should validate the owner's reference and keep the row", async () => {
        class ValidatedOwner extends Owner {
          static get jsonSchema() {
            return {
              type: 'object',
              properties: {
                petId: { type: 'integer' },
              },
            };
          }
        }

        const error = await ValidatedOwner.query()
          .upsertGraph({ id: 1, pet: null })
          .catch((err) => err);

        expect(error).toBeInstanceOf(ValidationError);
        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: 1 }]);
        expect(await knex('bt1_delete_pet')).toEqual([{ id: 1 }]);
      });
    }

    beforeAll(() => {
      Owner.knex(knex);
    });

    beforeEach(async () => {
      await knex('bt1_delete_pet').insert({ id: 1 });
      await knex('bt1_delete_owner').insert({ id: 1, petId: 1 });
    });

    afterEach(async () => {
      await knex('bt1_delete_owner').delete();
      await knex('bt1_delete_pet').delete();
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('bt1_delete_owner').dropTableIfExists('bt1_delete_pet');
    });

    describe('with ON DELETE SET NULL', () => {
      beforeAll(() => {
        return createTables((table) => {
          table.integer('petId').references('bt1_delete_pet.id').onDelete('SET NULL');
        });
      });

      itShouldReplaceTheRow();
      itShouldRemoveTheReferenceBeforeTheRow();
    });

    describe('with ON DELETE CASCADE', () => {
      beforeAll(() => {
        return createTables((table) => {
          table.integer('petId').references('bt1_delete_pet.id').onDelete('CASCADE');
        });
      });

      itShouldReplaceTheRow();
      itShouldRemoveTheReferenceBeforeTheRow();
    });

    describe('with a NOT NULL reference and ON DELETE CASCADE', () => {
      beforeAll(() => {
        return createTables((table) => {
          table.integer('petId').notNullable().references('bt1_delete_pet.id').onDelete('CASCADE');
        });
      });

      it('should fail to set the reference to null and keep the rows', async () => {
        const error = await Owner.query()
          .upsertGraph({ id: 1, pet: null })
          .catch((err) => err);

        // MySQL without strict mode writes 0 instead, which violates the foreign key.
        expect(error).toBeInstanceOf(DBError);
        expect(await knex('bt1_delete_owner')).toEqual([{ id: 1, petId: 1 }]);
        expect(await knex('bt1_delete_pet')).toEqual([{ id: 1 }]);
      });

      itShouldReplaceTheRow();
    });

    describe('with a reference without ON DELETE action', () => {
      beforeAll(() => {
        return createTables((table) => {
          table.integer('petId').references('bt1_delete_pet.id');
        });
      });

      itShouldReplaceTheRow();
      itShouldRemoveTheReferenceBeforeTheRow();
    });
  });
};
