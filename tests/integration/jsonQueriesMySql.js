import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('JSON queries on MySQL (ditojs#113)', () => {
    class ModelJson extends Model {
      static get tableName() {
        return 'ModelJson';
      }
    }

    let BoundModel;

    beforeAll(async () => {
      BoundModel = ModelJson.bindKnex(session.knex);

      await session.knex.schema.dropTableIfExists('ModelJson');
      await session.knex.schema.createTable('ModelJson', (table) => {
        table.integer('id').primary();
        table.json('data');
      });

      await session.knex('ModelJson').insert([
        { id: 1, data: JSON.stringify({ a: 1, b: [1, 2] }) },
        { id: 2, data: JSON.stringify({ a: 2, b: [2, 3] }) },
        { id: 3, data: JSON.stringify({ a: 1 }) },
      ]);
    });

    afterAll(() => {
      return session.knex.schema.dropTableIfExists('ModelJson');
    });

    const ids = (query) => query.orderBy('id').then((rows) => rows.map((it) => it.id));

    it('whereJsonSupersetOf() should use knex', async () => {
      expect(await ids(BoundModel.query().whereJsonSupersetOf('data', { a: 1 }))).toEqual([1, 3]);
      expect(await ids(BoundModel.query().whereJsonNotSupersetOf('data', { a: 1 }))).toEqual([2]);
      expect(
        await ids(
          BoundModel.query()
            .whereJsonSupersetOf('data', { a: 2 })
            .orWhereJsonSupersetOf('ModelJson.data', { b: [1] }),
        ),
      ).toEqual([1, 2]);
    });

    it('whereJsonSubsetOf() should use knex', async () => {
      expect(
        await ids(BoundModel.query().whereJsonSubsetOf('data', { a: 1, b: [1, 2], c: 3 })),
      ).toEqual([1, 3]);
      expect(
        await ids(
          BoundModel.query()
            .where('id', 3)
            .orWhereJsonNotSubsetOf('data', { a: 1, b: [1, 2] }),
        ),
      ).toEqual([2, 3]);
    });
  });
};
