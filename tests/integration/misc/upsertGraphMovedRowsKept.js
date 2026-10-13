import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() rows below moved rows that the graph keeps elsewhere', () => {
    const { knex } = session;

    class Movie extends Model {
      static get tableName() {
        return 'graph_kept_movie';
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'graph_kept_person';
      }

      static get relationMappings() {
        return {
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'graph_kept_person.id', to: 'graph_kept_person.parentId' },
          },
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'graph_kept_person.id',
              through: {
                from: 'graph_kept_person_movie.personId',
                to: 'graph_kept_person_movie.movieId',
              },
              to: 'graph_kept_movie.id',
            },
          },
        };
      }
    }

    const tables = ['graph_kept_person_movie', 'graph_kept_movie', 'graph_kept_person'];

    const dropTables = async () => {
      for (const table of tables) {
        await knex.schema.dropTableIfExists(table);
      }
    };

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('graph_kept_person', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('parentId');
        })
        .createTable('graph_kept_movie', (table) => {
          table.increments('id');
          table.string('title');
        })
        .createTable('graph_kept_person_movie', (table) => {
          table.integer('personId');
          table.integer('movieId');
        });
    });

    // Truncating resets the ids: persons 1 and 2, and movie 1 of person 1.
    beforeEach(async () => {
      for (const table of tables) {
        await knex(table).truncate();
      }

      for (const name of ['a', 'b']) {
        await knex('graph_kept_person').insert({ name });
      }

      await knex('graph_kept_movie').insert({ title: 'movie' });
      await knex('graph_kept_person_movie').insert({ personId: 1, movieId: 1 });
    });

    afterAll(dropTables);

    it('should keep a many-to-many row that moves from a related model to another owner', async () => {
      await Person.query(knex).upsertGraph(
        {
          name: 'new',
          children: [
            { id: 1, movies: [] },
            { name: 'other', movies: [{ id: 1 }] },
          ],
        },
        { relate: true },
      );

      const other = await knex('graph_kept_person').where('name', 'other').first();
      expect(await knex('graph_kept_movie').pluck('id')).toEqual([1]);
      expect(await knex('graph_kept_person_movie')).toEqual([{ personId: other.id, movieId: 1 }]);
    });

    it('should keep a root that the subgraph of a moved row removes', async () => {
      await knex('graph_kept_person').where('id', 2).update({ parentId: 1 });

      await Person.query(knex).upsertGraph(
        [{ name: 'new', children: [{ id: 1, children: [] }] }, { id: 2 }],
        { relate: true },
      );

      expect(await knex('graph_kept_person').where('id', 2).first()).toMatchObject({
        id: 2,
        parentId: null,
      });
    });
  });
};
