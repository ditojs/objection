import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('upsertGraph() #ref to an existing model in a ManyToManyRelation', () => {
    const { knex } = session;

    class Pet extends Model {
      static get tableName() {
        return 'graph_ref_m2m_pet';
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'graph_ref_m2m_person';
      }

      static get relationMappings() {
        return {
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'graph_ref_m2m_person.id', to: 'graph_ref_m2m_person.parentId' },
          },
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'graph_ref_m2m_person.id', to: 'graph_ref_m2m_pet.ownerId' },
          },
          friends: {
            relation: Model.ManyToManyRelation,
            modelClass: Person,
            join: {
              from: 'graph_ref_m2m_person.id',
              through: { from: 'graph_ref_m2m_friend.aId', to: 'graph_ref_m2m_friend.bId' },
              to: 'graph_ref_m2m_person.id',
            },
          },
        };
      }
    }

    const dropTables = () =>
      knex.schema
        .dropTableIfExists('graph_ref_m2m_friend')
        .dropTableIfExists('graph_ref_m2m_pet')
        .dropTableIfExists('graph_ref_m2m_person');

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('graph_ref_m2m_person', (table) => {
          table.integer('id').primary();
          table.integer('parentId');
        })
        .createTable('graph_ref_m2m_pet', (table) => {
          table.integer('id').primary();
          table.integer('ownerId');
        })
        .createTable('graph_ref_m2m_friend', (table) => {
          table.integer('aId');
          table.integer('bId');
        });

      await knex('graph_ref_m2m_person').insert([{ id: 1 }, { id: 2, parentId: 1 }]);
      await knex('graph_ref_m2m_pet').insert([{ id: 10, ownerId: 2 }]);
    });

    afterAll(dropTables);

    it('should relate a #ref with relations to a model that the graph patches elsewhere', async () => {
      await Person.query(knex).upsertGraph(
        {
          id: 1,
          children: [{ '#id': 'child', id: 2 }],
          friends: [{ '#ref': 'child', pets: [{ id: 10 }] }],
        },
        { relate: true, allowRefs: true },
      );

      expect(await knex('graph_ref_m2m_friend').select('aId', 'bId')).toEqual([{ aId: 1, bId: 2 }]);
      expect(await knex('graph_ref_m2m_pet')).toEqual([{ id: 10, ownerId: 2 }]);
    });
  });
};
