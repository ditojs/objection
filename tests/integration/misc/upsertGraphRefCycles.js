import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() #ref cycles through existing models', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'graph_ref_cycle_person';
      }

      static get relationMappings() {
        return {
          boss: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'graph_ref_cycle_person.bossId', to: 'graph_ref_cycle_person.id' },
          },
          // Joined through a column that isn't the id:
          mentor: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: {
              from: 'graph_ref_cycle_person.mentorName',
              to: 'graph_ref_cycle_person.name',
            },
          },
        };
      }
    }

    beforeAll(async () => {
      await knex.schema.dropTableIfExists('graph_ref_cycle_person');
      await knex.schema.createTable('graph_ref_cycle_person', (table) => {
        table.increments('id');
        table.string('name');
        table.integer('bossId');
        table.string('mentorName');
      });
    });

    beforeEach(async () => {
      await knex('graph_ref_cycle_person').truncate();

      for (const name of ['a', 'b']) {
        await knex('graph_ref_cycle_person').insert({ name });
      }
    });

    afterAll(() => knex.schema.dropTableIfExists('graph_ref_cycle_person'));

    const getPerson = (id) => knex('graph_ref_cycle_person').where('id', id).first();

    it('should relate a model to itself', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, '#id': 'a', boss: { '#ref': 'a' } },
        { allowRefs: true, relate: true },
      );

      expect((await getPerson(1)).bossId).toBe(1);
    });

    it('should relate existing models to each other', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, '#id': 'a', boss: { id: 2, boss: { '#ref': 'a' } } },
        { allowRefs: true, relate: true },
      );

      expect((await getPerson(1)).bossId).toBe(2);
      expect((await getPerson(2)).bossId).toBe(1);
    });

    // The key that the relation reads from the referenced model is filled in by
    // the graph, so the `#ref` still waits for it:
    it('should read the key of a #ref once the graph fills it in', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 1, name: 'renamed #ref{n.name}' },
          { id: 2, mentor: { '#ref': 'a' } },
          { '#id': 'n', name: 'new' },
        ],
        { allowRefs: true, insertMissing: true },
      );

      expect((await getPerson(2)).mentorName).toBe('renamed new');
    });
  });
};
