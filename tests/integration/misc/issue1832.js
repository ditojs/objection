import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Model } from 'objection';
import { resetDeprecations } from '../../../lib/utils/deprecate.js';

export default (session) => {
  describe('warn when fetching relations of owners without join properties #1832', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'issue1832Person';
      }
    }

    class Animal extends Model {
      static get tableName() {
        return 'issue1832Animal';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: {
              from: 'issue1832Animal.ownerId',
              to: 'issue1832Person.id',
            },
          },

          keepers: {
            relation: Model.ManyToManyRelation,
            modelClass: Person,
            join: {
              from: 'issue1832Animal.id',
              through: {
                from: 'issue1832AnimalKeeper.animalId',
                to: 'issue1832AnimalKeeper.personId',
              },
              to: 'issue1832Person.id',
            },
          },

          keeper: {
            relation: Model.HasOneThroughRelation,
            modelClass: Person,
            join: {
              from: 'issue1832Animal.id',
              through: {
                from: 'issue1832AnimalKeeper.animalId',
                to: 'issue1832AnimalKeeper.personId',
              },
              to: 'issue1832Person.id',
            },
          },
        };
      }
    }

    let warnings;
    let originalWarn;

    beforeAll(async () => {
      await knex.schema
        .dropTableIfExists('issue1832AnimalKeeper')
        .dropTableIfExists('issue1832Animal')
        .dropTableIfExists('issue1832Person')
        .createTable('issue1832Person', (t) => {
          t.integer('id').primary();
          t.string('name');
        })
        .createTable('issue1832Animal', (t) => {
          t.integer('id').primary();
          t.integer('ownerId');
          t.string('name');
        })
        .createTable('issue1832AnimalKeeper', (t) => {
          t.integer('animalId');
          t.integer('personId');
        });

      await knex('issue1832Person').insert({ id: 1, name: 'Jennifer' });
      await knex('issue1832Animal').insert([
        { id: 1, ownerId: 1, name: 'Doggo' },
        { id: 2, ownerId: null, name: 'Stray' },
      ]);
      await knex('issue1832AnimalKeeper').insert({ animalId: 1, personId: 1 });
    });

    afterAll(async () => {
      await knex.schema
        .dropTableIfExists('issue1832AnimalKeeper')
        .dropTableIfExists('issue1832Animal')
        .dropTableIfExists('issue1832Person');
    });

    beforeEach(() => {
      resetDeprecations();
      warnings = [];
      originalWarn = console.warn;
      console.warn = (message) => warnings.push(message);
    });

    afterEach(() => {
      console.warn = originalWarn;
      resetDeprecations();
    });

    const expectedWarning =
      'Fetching relation "owner" of Animal: some owner models are missing the join property ' +
      '"issue1832Animal.ownerId", so no related models are found for them. ' +
      'Select the column in the owner query.';

    it('$fetchGraph() should warn if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex).findById(1).select('id', 'name');
      await doggo.$fetchGraph('owner', { transaction: knex });

      expect(doggo.owner).toBeNull();
      expect(warnings).toEqual([expectedWarning]);
    });

    it('$relatedQuery() should warn if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex).findById(1).select('id', 'name');
      const owner = await doggo.$relatedQuery('owner', knex);

      expect(owner).toBeUndefined();
      expect(warnings).toEqual([expectedWarning]);
    });

    it('should only warn once per relation', async () => {
      const animals = await Animal.query(knex).select('id', 'name');
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });

      expect(warnings).toEqual([expectedWarning]);
    });

    it('should not warn if the foreign key is selected or null', async () => {
      const animals = await Animal.query(knex).orderBy('id');
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });

      expect(animals.map((it) => it.owner && it.owner.name)).toEqual(['Jennifer', null]);
      expect(warnings).toEqual([]);
    });

    it('withGraphFetched() should not warn if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex)
        .findById(1)
        .select('id', 'name')
        .withGraphFetched('owner');

      expect(doggo.owner.name).toBe('Jennifer');
      expect(warnings).toEqual([]);
    });

    const expectedThroughWarning = (relation) =>
      `Fetching relation "${relation}" of Animal: some owner models are missing the join ` +
      'property "issue1832Animal.id", so no related models are found for them. ' +
      'Select the column in the owner query.';

    it('$fetchGraph() should warn if the id is not selected for a ManyToManyRelation', async () => {
      const doggo = await Animal.query(knex).findById(1).select('name');
      await doggo.$fetchGraph('keepers', { transaction: knex });

      expect(doggo.keepers).toEqual([]);
      expect(warnings).toEqual([expectedThroughWarning('keepers')]);
    });

    it('$fetchGraph() should warn if the id is not selected for a HasOneThroughRelation', async () => {
      const doggo = await Animal.query(knex).findById(1).select('name');
      await doggo.$fetchGraph('keeper', { transaction: knex });

      expect(doggo.keeper).toBeNull();
      expect(warnings).toEqual([expectedThroughWarning('keeper')]);
    });

    it('should not warn if the id is selected for a ManyToManyRelation', async () => {
      const animals = await Animal.query(knex).orderBy('id');
      await Animal.fetchGraph(animals, '[keepers, keeper]', { transaction: knex });

      expect(animals.map((it) => it.keepers.map((it) => it.name))).toEqual([['Jennifer'], []]);
      expect(animals.map((it) => it.keeper && it.keeper.name)).toEqual(['Jennifer', null]);
      expect(warnings).toEqual([]);
    });
  });
};
