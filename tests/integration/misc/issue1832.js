import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('throw when fetching relations of owners loaded without join properties #1832', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'issue1832Person';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Animal,
            join: {
              from: 'issue1832Person.id',
              to: 'issue1832Animal.ownerId',
            },
          },

          petsByCode: {
            relation: Model.HasManyRelation,
            modelClass: Animal,
            join: {
              from: 'issue1832Person.code',
              to: 'issue1832Animal.ownerCode',
            },
          },
        };
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

    class Tag extends Model {
      static get tableName() {
        return 'issue1832AnimalTag';
      }

      static get idColumn() {
        return ['animalId', 'tag'];
      }

      static get relationMappings() {
        return {
          animal: {
            relation: Model.BelongsToOneRelation,
            modelClass: Animal,
            join: {
              from: 'issue1832AnimalTag.animalId',
              to: 'issue1832Animal.id',
            },
          },
        };
      }
    }

    beforeAll(async () => {
      await knex.schema
        .dropTableIfExists('issue1832AnimalTag')
        .dropTableIfExists('issue1832AnimalKeeper')
        .dropTableIfExists('issue1832Animal')
        .dropTableIfExists('issue1832Person')
        .createTable('issue1832Person', (t) => {
          t.integer('id').primary();
          t.string('code');
          t.string('name');
        })
        .createTable('issue1832Animal', (t) => {
          t.integer('id').primary();
          t.integer('ownerId');
          t.string('ownerCode');
          t.string('name');
        })
        .createTable('issue1832AnimalKeeper', (t) => {
          t.integer('animalId');
          t.integer('personId');
        })
        .createTable('issue1832AnimalTag', (t) => {
          t.integer('animalId');
          t.string('tag');
          t.primary(['animalId', 'tag']);
        });

      await knex('issue1832Person').insert({ id: 1, code: 'jen', name: 'Jennifer' });
      await knex('issue1832Animal').insert([
        { id: 1, ownerId: 1, ownerCode: 'jen', name: 'Doggo' },
        { id: 2, ownerId: null, ownerCode: null, name: 'Stray' },
      ]);
      await knex('issue1832AnimalKeeper').insert({ animalId: 1, personId: 1 });
      await knex('issue1832AnimalTag').insert({ animalId: 1, tag: 'good' });
    });

    afterAll(async () => {
      await knex.schema
        .dropTableIfExists('issue1832AnimalTag')
        .dropTableIfExists('issue1832AnimalKeeper')
        .dropTableIfExists('issue1832Animal')
        .dropTableIfExists('issue1832Person');
    });

    const missingIdError =
      'Unable to fetch relation "pets" of Person: some owner models loaded from the database ' +
      'are missing the join property "issue1832Person.id". Select the column in the owner query.';

    it('$fetchGraph() should throw if the id is not selected for a HasManyRelation', async () => {
      const jennifer = await Person.query(knex).findById(1).select('name');

      await expect(jennifer.$fetchGraph('pets', { transaction: knex })).rejects.toThrow(
        missingIdError,
      );
      expect(jennifer.pets).toBeUndefined();
    });

    it('$relatedQuery() should throw if the id is not selected for a HasManyRelation', async () => {
      const jennifer = await Person.query(knex).findById(1).select('name');

      await expect(jennifer.$relatedQuery('pets', knex)).rejects.toThrow(missingIdError);
    });

    it('should throw if the id of some of the owners is not selected', async () => {
      const people = [
        ...(await Person.query(knex).select('id', 'name')),
        ...(await Person.query(knex).select('name')),
      ];

      await expect(Person.fetchGraph(people, 'pets', { transaction: knex })).rejects.toThrow(
        missingIdError,
      );
    });

    it('should throw for clones of owners loaded without the id', async () => {
      const jennifer = await Person.query(knex).findById(1).select('name');
      const clone = jennifer.$clone();

      expect(clone.toJSON()).toEqual({ name: 'Jennifer' });
      await expect(clone.$fetchGraph('pets', { transaction: knex })).rejects.toThrow(
        missingIdError,
      );
    });

    it('should find no related models for owners built in memory without the id', async () => {
      const jennifer = Person.fromJson({ name: 'Jennifer' });
      await jennifer.$fetchGraph('pets', { transaction: knex });
      const pets = await Person.fromJson({ name: 'Jennifer' }).$relatedQuery('pets', knex);

      expect(jennifer.pets).toEqual([]);
      expect(pets).toEqual([]);
    });

    it('should not throw if the foreign key is selected or null', async () => {
      const animals = await Animal.query(knex).orderBy('id');
      await Animal.fetchGraph(animals, 'owner', { transaction: knex });

      expect(animals.map((it) => it.owner && it.owner.name)).toEqual(['Jennifer', null]);
    });

    it('withGraphFetched() should not throw if the foreign key is not selected', async () => {
      const doggo = await Animal.query(knex)
        .findById(1)
        .select('id', 'name')
        .withGraphFetched('owner');

      expect(doggo.owner.name).toBe('Jennifer');
    });

    it('$fetchGraph() should throw if a non-id column is not selected for a HasManyRelation', async () => {
      const jennifer = await Person.query(knex).findById(1).select('id', 'name');

      await expect(jennifer.$fetchGraph('petsByCode', { transaction: knex })).rejects.toThrow(
        'Unable to fetch relation "petsByCode" of Person: some owner models loaded from the ' +
          'database are missing the join property "issue1832Person.code". Select the column in ' +
          'the owner query.',
      );
    });

    it('$fetchGraph() should throw if a foreign key in the composite id is not selected', async () => {
      const tag = await Tag.query(knex).first().select('tag');

      await expect(tag.$fetchGraph('animal', { transaction: knex })).rejects.toThrow(
        'Unable to fetch relation "animal" of Tag: some owner models loaded from the database ' +
          'are missing the join property "issue1832AnimalTag.animalId". Select the column in ' +
          'the owner query.',
      );
    });

    // Nullable foreign keys that were never set are `undefined` too, e.g. on
    // models returned by `insert()` or created with `fromJson()` (#132).
    it('should not throw if the foreign key of an inserted model is not set', async () => {
      const inserted = await Animal.query(knex).insert({ id: 3, name: 'Newcomer' });

      try {
        await inserted.$fetchGraph('owner', { transaction: knex });

        expect(inserted.owner).toBeNull();
      } finally {
        await Animal.query(knex).deleteById(3);
      }
    });

    it('should not throw if the foreign key of a model created with fromJson() is not set', async () => {
      const stray = Animal.fromJson({ id: 2, name: 'Stray' });
      await stray.$fetchGraph('owner', { transaction: knex });
      const owner = await stray.$relatedQuery('owner', knex);

      expect(stray.owner).toBeNull();
      expect(owner).toBeUndefined();
    });

    // Inserted models are the instances passed to `insert()`, with only the
    // returned columns merged into them, so they don't count as loaded.
    it.skipIf(!session.isPostgres())(
      'should not throw if the foreign key of a model inserted with returning() is not set',
      async () => {
        const inserted = await Animal.query(knex)
          .insert({ id: 3, name: 'Newcomer' })
          .returning('id');

        try {
          await inserted.$fetchGraph('owner', { transaction: knex });

          expect(inserted.owner).toBeNull();
        } finally {
          await Animal.query(knex).deleteById(3);
        }
      },
    );

    it('$fetchGraph() should throw if the foreign key is not selected for a BelongsToOneRelation', async () => {
      const doggo = await Animal.query(knex).findById(1).select('id', 'name');

      await expect(doggo.$fetchGraph('owner', { transaction: knex })).rejects.toThrow(
        'Unable to fetch relation "owner" of Animal: some owner models loaded from the database ' +
          'are missing the join property "issue1832Animal.ownerId". Select the column in the ' +
          'owner query.',
      );
    });

    const throughError = (relation) =>
      `Unable to fetch relation "${relation}" of Animal: some owner models loaded from the ` +
      'database are missing the join property "issue1832Animal.id". Select the column in the ' +
      'owner query.';

    it('$fetchGraph() should throw if the id is not selected for a ManyToManyRelation', async () => {
      const doggo = await Animal.query(knex).findById(1).select('name');

      await expect(doggo.$fetchGraph('keepers', { transaction: knex })).rejects.toThrow(
        throughError('keepers'),
      );
    });

    it('$fetchGraph() should throw if the id is not selected for a HasOneThroughRelation', async () => {
      const doggo = await Animal.query(knex).findById(1).select('name');

      await expect(doggo.$fetchGraph('keeper', { transaction: knex })).rejects.toThrow(
        throughError('keeper'),
      );
    });

    it('should not throw if the id is selected for a ManyToManyRelation', async () => {
      const animals = await Animal.query(knex).orderBy('id');
      await Animal.fetchGraph(animals, '[keepers, keeper]', { transaction: knex });

      expect(animals.map((it) => it.keepers.map((it) => it.name))).toEqual([['Jennifer'], []]);
      expect(animals.map((it) => it.keeper && it.keeper.name)).toEqual(['Jennifer', null]);
    });
  });
};
