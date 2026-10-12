import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model, NotFoundError } from 'objection';

export default (session) => {
  describe('upsertGraph() writing rows that an earlier write deleted', () => {
    const { knex } = session;

    class Node extends Model {
      static get tableName() {
        return 'deleted_rows_node';
      }

      static get relationMappings() {
        return {
          children: {
            relation: Model.HasManyRelation,
            modelClass: Node,
            join: { from: 'deleted_rows_node.id', to: 'deleted_rows_node.parentId' },
          },
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'deleted_rows_pet';
      }

      // A property that isn't written to the database:
      $formatDatabaseJson(json) {
        const { nickname, ...rest } = super.$formatDatabaseJson(json);
        return rest;
      }
    }

    let onBeforeUpdateMovie = null;

    class Movie extends Model {
      static get tableName() {
        return 'deleted_rows_movie';
      }

      static async beforeUpdate() {
        await onBeforeUpdateMovie?.();
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'deleted_rows_person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'deleted_rows_person.id', to: 'deleted_rows_pet.ownerId' },
          },
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'deleted_rows_person.id',
              through: {
                from: 'deleted_rows_person_movie.personId',
                to: 'deleted_rows_person_movie.movieId',
                extra: ['role'],
              },
              to: 'deleted_rows_movie.id',
            },
          },
        };
      }
    }

    class Org extends Model {
      static get tableName() {
        return 'deleted_rows_org';
      }

      static get relationMappings() {
        return {
          people: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'deleted_rows_org.id', to: 'deleted_rows_person.orgId' },
          },
        };
      }
    }

    function dropTables() {
      return knex.schema
        .dropTableIfExists('deleted_rows_node')
        .dropTableIfExists('deleted_rows_person_movie')
        .dropTableIfExists('deleted_rows_movie')
        .dropTableIfExists('deleted_rows_pet')
        .dropTableIfExists('deleted_rows_person')
        .dropTableIfExists('deleted_rows_org');
    }

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('deleted_rows_org', (table) => {
          table.integer('id').primary();
        })
        .createTable('deleted_rows_person', (table) => {
          table.integer('id').primary();
          table.integer('orgId').references('deleted_rows_org.id').onDelete('CASCADE');
        })
        .createTable('deleted_rows_pet', (table) => {
          table.integer('id').primary();
          table.integer('ownerId').references('deleted_rows_person.id').onDelete('CASCADE');
        })
        .createTable('deleted_rows_movie', (table) => {
          table.integer('id').primary();
        })
        .createTable('deleted_rows_person_movie', (table) => {
          table.integer('personId');
          table.integer('movieId');
          table.string('role');
        });

      // SQL Server rejects cascading actions on self-references.
      if (!session.isMsSql()) {
        await knex.schema.createTable('deleted_rows_node', (table) => {
          table.integer('id').primary();
          table.integer('parentId').references('deleted_rows_node.id').onDelete('CASCADE');
        });
      }

      for (const modelClass of [Node, Pet, Movie, Person, Org]) {
        modelClass.knex(knex);
      }
    });

    beforeEach(async () => {
      onBeforeUpdateMovie = null;
      await knex('deleted_rows_person_movie').delete();
      await knex('deleted_rows_movie').delete();
      await knex('deleted_rows_pet').delete();
      await knex('deleted_rows_person').delete();
      await knex('deleted_rows_org').delete();
      await knex('deleted_rows_org').insert({ id: 1 });
      await knex('deleted_rows_person').insert([
        { id: 1, orgId: 1 },
        { id: 2, orgId: 1 },
      ]);
      await knex('deleted_rows_pet').insert({ id: 2, ownerId: 2 });
    });

    afterAll(dropTables);

    // Relates below new rows run after the deletes.
    function upsertPetBelowNewPerson(trx) {
      return Org.query(trx).upsertGraph(
        { id: 1, people: [{ id: 1 }, { id: 3, pets: [{ id: 2 }] }] },
        { relate: true, insertMissing: true },
      );
    }

    async function expectNothingWritten() {
      expect(await knex('deleted_rows_person').orderBy('id')).toEqual([
        { id: 1, orgId: 1 },
        { id: 2, orgId: 1 },
      ]);
      expect(await knex('deleted_rows_pet')).toEqual([{ id: 2, ownerId: 2 }]);
    }

    it('should throw when relating a row that a delete cascaded to', async () => {
      const err = await Org.transaction((trx) => upsertPetBelowNewPerson(trx)).catch((err) => err);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.message).toBe(
        'model (id=2) was not found when updating it. An earlier write of the graph or a concurrent query may have deleted it',
      );
      expect(err.data.dataPath).toEqual(['people', 1, 'pets', 0]);
      await expectNothingWritten();
    });

    it('should throw when updating the extras of a join row that a concurrent query deleted', async () => {
      await knex('deleted_rows_movie').insert({ id: 1 });
      await knex('deleted_rows_person_movie').insert({ personId: 1, movieId: 1, role: 'a' });
      onBeforeUpdateMovie = () => knex('deleted_rows_person_movie').delete();

      await expect(
        Person.query().upsertGraph({ id: 1, movies: [{ id: 1, role: 'b' }] }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should not throw for a patch that writes no column', async () => {
      const person = await Person.query().upsertGraph({
        id: 2,
        pets: [{ id: 2, nickname: 'Rex' }],
      });

      expect(person.pets[0].nickname).toBe('Rex');
      await expectNothingWritten();
    });

    it.skipIf(!session.isPostgres())('should throw with returning(*)', async () => {
      await expect(
        Org.transaction((trx) => upsertPetBelowNewPerson(trx).returning('*')),
      ).rejects.toThrow(NotFoundError);

      await expectNothingWritten();
    });

    it.skipIf(session.isMsSql())(
      'should throw when relating a row that a delete cascaded to in a tree',
      async () => {
        await knex('deleted_rows_node').delete();
        await knex('deleted_rows_node').insert([
          { id: 1, parentId: null },
          { id: 2, parentId: 1 },
          { id: 3, parentId: 2 },
        ]);

        await expect(
          Node.transaction((trx) =>
            Node.query(trx).upsertGraph(
              { id: 1, children: [{ id: 4, children: [{ id: 3 }] }] },
              { relate: true, insertMissing: true },
            ),
          ),
        ).rejects.toThrow(NotFoundError);

        expect(await knex('deleted_rows_node').orderBy('id')).toEqual([
          { id: 1, parentId: null },
          { id: 2, parentId: 1 },
          { id: 3, parentId: 2 },
        ]);
      },
    );
  });
};
