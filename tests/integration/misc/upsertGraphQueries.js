import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() queries', () => {
    const { knex } = session;

    class Pet extends Model {
      static get tableName() {
        return 'graph_queries_pet';
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'graph_queries_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_queries_person.id', to: 'graph_queries_pet.ownerId' },
          },
        };
      }
    }

    const dropTables = () =>
      knex.schema.dropTableIfExists('graph_queries_pet').dropTableIfExists('graph_queries_person');

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('graph_queries_person', (table) => {
          table.integer('id').primary();
        })
        .createTable('graph_queries_pet', (table) => {
          table.integer('id').primary();
          table.string('name');
          table.integer('age');
          table.integer('ownerId');
        });
    });

    beforeEach(async () => {
      await knex('graph_queries_pet').delete();
      await knex('graph_queries_person').delete();
      await knex('graph_queries_person').insert([{ id: 1 }, { id: 2 }]);
      await knex('graph_queries_pet').insert([
        { id: 1, name: 'a', age: 1, ownerId: 1 },
        { id: 2, name: 'b', age: 2, ownerId: 1 },
        { id: 3, name: 'c', age: 3, ownerId: 2 },
        { id: 4, name: 'd', age: 4, ownerId: 2 },
      ]);
    });

    afterAll(dropTables);

    const collectQueries = async (callback) => {
      const queries = [];
      const onQuery = ({ sql }) => queries.push(sql.toLowerCase());
      knex.on('query', onQuery);

      try {
        await callback();
      } finally {
        knex.removeListener('query', onQuery);
      }

      return queries;
    };

    const selectPets = () => knex('graph_queries_pet').select('id', 'name', 'age').orderBy('id');

    it('should patch the rows of a table in one query', async () => {
      const queries = await collectQueries(() =>
        Person.query(knex).upsertGraph([
          {
            id: 1,
            pets: [
              { id: 1, name: 'x' },
              { id: 2, age: 20 },
            ],
          },
          { id: 2, pets: [{ id: 3, name: 'y', age: 30 }, { id: 4 }] },
        ]),
      );

      expect(queries.filter((sql) => sql.startsWith('update'))).toHaveLength(1);
      expect(await selectPets()).toEqual([
        { id: 1, name: 'x', age: 1 },
        { id: 2, name: 'b', age: 20 },
        { id: 3, name: 'y', age: 30 },
        { id: 4, name: 'd', age: 4 },
      ]);
    });

    it('should patch the rows of models with update hooks one by one', async () => {
      class HookedPet extends Pet {
        $beforeUpdate() {
          this.age = 99;
        }
      }

      class HookedPerson extends Person {
        static get relationMappings() {
          return { pets: { ...super.relationMappings.pets, modelClass: HookedPet } };
        }
      }

      const queries = await collectQueries(() =>
        HookedPerson.query(knex).upsertGraph({
          id: 1,
          pets: [
            { id: 1, name: 'x' },
            { id: 2, name: 'y' },
          ],
        }),
      );

      expect(queries.filter((sql) => sql.startsWith('update'))).toHaveLength(2);
      expect(await selectPets()).toEqual([
        { id: 1, name: 'x', age: 99 },
        { id: 2, name: 'y', age: 99 },
        { id: 3, name: 'c', age: 3 },
        { id: 4, name: 'd', age: 4 },
      ]);
    });

    // SQL Server binds at most 2100 values per query.
    it('should patch and delete more rows than one query can bind', async () => {
      const pets = Array.from({ length: 4200 }, (_, i) => ({ id: 10 + i, name: 'p', ownerId: 1 }));

      for (let i = 0; i < pets.length; i += 100) {
        await knex('graph_queries_pet').insert(pets.slice(i, i + 100));
      }

      await Person.query(knex).upsertGraph({
        id: 1,
        pets: pets.slice(0, 2100).map(({ id }) => ({ id, name: 'q' })),
      });

      const rows = await knex('graph_queries_pet').where('ownerId', 1);
      expect(rows).toHaveLength(2100);
      expect(rows.every((row) => row.name === 'q')).toBe(true);
    });

    it('should delete the removed rows of a relation in one query', async () => {
      const queries = await collectQueries(() =>
        Person.query(knex).upsertGraph([
          { id: 1, pets: [{ id: 1 }] },
          { id: 2, pets: [{ id: 3 }] },
        ]),
      );

      expect(queries.filter((sql) => sql.startsWith('delete'))).toHaveLength(1);
      expect((await selectPets()).map((pet) => pet.id)).toEqual([1, 3]);
    });
  });
};
