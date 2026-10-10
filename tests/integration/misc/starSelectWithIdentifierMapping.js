import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Knex from 'knex';
import { Model, knexSnakeCaseMappers } from 'objection';

export default (session) => {
  describe('table.* selections with identifier mapping and withGraphFetched() #2288', () => {
    let knex;
    let BusinessUnit;
    let Field;

    beforeAll(() => {
      return session.knex.schema
        .dropTableIfExists('data_extension_field')
        .dropTableIfExists('data_extension')
        .dropTableIfExists('business_unit')
        .createTable('business_unit', (table) => {
          table.increments('id').primary();
          table.string('name');
        })
        .createTable('data_extension', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('business_unit_id');
        })
        .createTable('data_extension_field', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('data_extension_id');
        });
    });

    afterAll(async () => {
      await session.knex.schema
        .dropTableIfExists('data_extension_field')
        .dropTableIfExists('data_extension')
        .dropTableIfExists('business_unit');

      await knex.destroy();
    });

    beforeAll(() => {
      knex = Knex({ ...session.opt.knexConfig, ...knexSnakeCaseMappers() });

      BusinessUnit = class BusinessUnit extends Model {
        static get tableName() {
          return 'businessUnit';
        }
      };

      Field = class Field extends Model {
        static get tableName() {
          return 'dataExtensionField';
        }
      };
    });

    beforeEach(async () => {
      await session.knex('data_extension_field').delete();
      await session.knex('data_extension').delete();
      await session.knex('business_unit').delete();
      await session.knex('business_unit').insert({ id: 1, name: 'Unit' });
      await session
        .knex('data_extension')
        .insert({ id: 1, name: 'Extension', business_unit_id: 1 });
      await session
        .knex('data_extension_field')
        .insert({ id: 1, name: 'Field', data_extension_id: 1 });
    });

    // The table name of the model and the one used in the selection only
    // differ in case style. Both map to `data_extension` in the database.
    for (const [tableName, selection] of [
      ['data_extension', 'dataExtension.*'],
      ['dataExtension', 'data_extension.*'],
      ['dataExtension', 'dataExtension.*'],
    ]) {
      describe(`tableName: '${tableName}', select('${selection}')`, () => {
        let DataExtension;

        beforeAll(() => {
          DataExtension = class DataExtension extends Model {
            static get tableName() {
              return tableName;
            }

            static get relationMappings() {
              return {
                businessUnit: {
                  relation: Model.BelongsToOneRelation,
                  modelClass: BusinessUnit,
                  join: {
                    from: `${tableName}.businessUnitId`,
                    to: 'businessUnit.id',
                  },
                },

                fields: {
                  relation: Model.HasManyRelation,
                  modelClass: Field,
                  join: {
                    from: `${tableName}.id`,
                    to: 'dataExtensionField.dataExtensionId',
                  },
                },
              };
            }
          };
        });

        it('should keep the selected relation columns in the result', async () => {
          const [result] = await DataExtension.query(knex)
            .select(selection)
            .withGraphFetched('[businessUnit, fields]');

          expect(result.id).toBe(1);
          expect(result.businessUnitId).toBe(1);
          expect(result.businessUnit.name).toBe('Unit');
          expect(result.fields.map((it) => it.name)).toEqual(['Field']);
        });

        it('should not select the relation columns again', () => {
          const sql = DataExtension.query(knex)
            .select(selection)
            .withGraphFetched('[businessUnit, fields]')
            .toKnexQuery()
            .toQuery();

          expect(sql).not.toMatch(/business_unit_id/);
          expect(sql).not.toMatch(/"?data_extension"?\."?id"?/);
        });
      });
    }
  });
};
