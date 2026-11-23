const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  // In multi-tenant schemas, every key starts with the same column, which the
  // keys of relations share with the ids of their models.
  describe('keys that share columns with ids (#561, #565)', () => {
    const { knex } = session;

    class Owner extends Model {
      static get tableName() {
        return 'shared_keys_owners';
      }
      static get idColumn() {
        return ['tenantId', 'code'];
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: {
              from: ['shared_keys_owners.tenantId', 'shared_keys_owners.code'],
              to: ['shared_keys_pets.tenantId', 'shared_keys_pets.ownerCode'],
            },
          },
          favoritePet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: {
              from: ['shared_keys_owners.tenantId', 'shared_keys_owners.favoritePetNo'],
              to: ['shared_keys_pets.tenantId', 'shared_keys_pets.petNo'],
            },
          },
          // The key of the related rows is their id:
          profile: {
            relation: Model.HasOneRelation,
            modelClass: Profile,
            join: {
              from: ['shared_keys_owners.tenantId', 'shared_keys_owners.code'],
              to: ['shared_keys_profiles.tenantId', 'shared_keys_profiles.ownerCode'],
            },
          },
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: ['shared_keys_owners.tenantId', 'shared_keys_owners.code'],
              through: {
                from: ['shared_keys_owners_movies.tenantId', 'shared_keys_owners_movies.ownerCode'],
                to: ['shared_keys_owners_movies.tenantId', 'shared_keys_owners_movies.movieCode'],
                extra: ['role'],
              },
              to: ['shared_keys_movies.tenantId', 'shared_keys_movies.code'],
            },
          },
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'shared_keys_pets';
      }
      static get idColumn() {
        return ['tenantId', 'petNo'];
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Owner,
            join: {
              from: ['shared_keys_pets.tenantId', 'shared_keys_pets.ownerCode'],
              to: ['shared_keys_owners.tenantId', 'shared_keys_owners.code'],
            },
          },
        };
      }
    }

    class Profile extends Model {
      static get tableName() {
        return 'shared_keys_profiles';
      }
      static get idColumn() {
        return ['tenantId', 'ownerCode'];
      }
    }

    class Movie extends Model {
      static get tableName() {
        return 'shared_keys_movies';
      }
      static get idColumn() {
        return ['tenantId', 'code'];
      }
    }

    const dropTables = () =>
      knex.schema
        .dropTableIfExists('shared_keys_owners_movies')
        .dropTableIfExists('shared_keys_movies')
        .dropTableIfExists('shared_keys_profiles')
        .dropTableIfExists('shared_keys_pets')
        .dropTableIfExists('shared_keys_owners');

    before(async () => {
      await dropTables();
      await knex.schema
        .createTable('shared_keys_owners', (table) => {
          table.integer('tenantId').notNullable();
          table.string('code').notNullable();
          table.integer('favoritePetNo');
          table.primary(['tenantId', 'code']);
        })
        .createTable('shared_keys_pets', (table) => {
          table.integer('tenantId').notNullable();
          table.integer('petNo').notNullable();
          table.string('ownerCode');
          table.primary(['tenantId', 'petNo']);
        })
        .createTable('shared_keys_profiles', (table) => {
          table.integer('tenantId').notNullable();
          table.string('ownerCode').notNullable();
          table.primary(['tenantId', 'ownerCode']);
        })
        .createTable('shared_keys_movies', (table) => {
          table.integer('tenantId').notNullable();
          table.string('code').notNullable();
          table.string('genre');
          table.primary(['tenantId', 'code']);
        })
        .createTable('shared_keys_owners_movies', (table) => {
          table.integer('tenantId').notNullable();
          table.string('ownerCode').notNullable();
          table.string('movieCode').notNullable();
          table.string('role');
        });
    });

    beforeEach(async () => {
      for (const table of [
        'shared_keys_owners_movies',
        'shared_keys_movies',
        'shared_keys_profiles',
        'shared_keys_pets',
        'shared_keys_owners',
      ]) {
        await knex(table).delete();
      }

      await knex('shared_keys_owners').insert({ tenantId: 1, code: 'jennifer' });
      await knex('shared_keys_pets').insert({ tenantId: 1, petNo: 1, ownerCode: 'jennifer' });
      await knex('shared_keys_profiles').insert({ tenantId: 1, ownerCode: 'jennifer' });
      await knex('shared_keys_movies').insert([
        { tenantId: 1, code: 'playbook', genre: 'drama' },
        { tenantId: 1, code: 'hunger', genre: 'action' },
      ]);
      await knex('shared_keys_owners_movies').insert([
        { tenantId: 1, ownerCode: 'jennifer', movieCode: 'playbook', role: 'Tiffany' },
        { tenantId: 1, ownerCode: 'jennifer', movieCode: 'hunger', role: 'Katniss' },
      ]);
    });

    after(() => dropTables());

    const bindKnex = (modelClass) => modelClass.bindKnex(knex);
    const findOwner = () => bindKnex(Owner).query().findById([1, 'jennifer']);
    const getPets = () => knex('shared_keys_pets').select('tenantId', 'petNo', 'ownerCode');
    const getMovieRows = () =>
      knex('shared_keys_owners_movies')
        .orderBy('movieCode')
        .select('tenantId', 'ownerCode', 'movieCode', 'role');

    it('has-many unrelate() should only clear the key columns that are not part of the id', async () => {
      const owner = await findOwner();
      await owner.$relatedQuery('pets').unrelate();

      expect(await getPets()).to.eql([{ tenantId: 1, petNo: 1, ownerCode: null }]);
    });

    it('belongs-to-one unrelate() should only clear the key columns that are not part of the id', async () => {
      const pet = await bindKnex(Pet).query().findById([1, 1]);
      await pet.$relatedQuery('owner').unrelate();

      expect(await getPets()).to.eql([{ tenantId: 1, petNo: 1, ownerCode: null }]);
      expect(pet.tenantId).to.equal(1);
      expect(pet.ownerCode).to.equal(null);
    });

    it('unrelate() should throw if all key columns are part of the id', async () => {
      const owner = await findOwner();

      const err = await owner
        .$relatedQuery('profile')
        .unrelate()
        .catch((err) => err);
      expect(err.message).to.equal(
        "Owner.relationMappings.profile: unrelate() can't clear the key (tenantId, ownerCode), as it is part of the id of Profile. Delete the related rows instead.",
      );
      expect(await knex('shared_keys_profiles')).to.have.length(1);
    });

    it('many-to-many unrelate() should only delete the join rows that match', async () => {
      const owner = await findOwner();
      await owner
        .$relatedQuery('movies')
        .unrelate()
        .whereIn(
          'shared_keys_movies.code',
          bindKnex(Movie).query().select('code').where('genre', 'drama'),
        );

      expect(await getMovieRows()).to.eql([
        { tenantId: 1, ownerCode: 'jennifer', movieCode: 'hunger', role: 'Katniss' },
      ]);

      await owner.$relatedQuery('movies').unrelate();
      expect(await getMovieRows()).to.eql([]);
    });

    it('upsertGraph() should only clear the has-many key columns that are not part of the id', async () => {
      await bindKnex(Owner)
        .query()
        .upsertGraph({ tenantId: 1, code: 'jennifer', pets: [] }, { unrelate: true });

      expect(await getPets()).to.eql([{ tenantId: 1, petNo: 1, ownerCode: null }]);
    });

    it('upsertGraph() should keep the id columns of unrelated rows for other places that read them', async () => {
      await bindKnex(Owner)
        .query()
        .upsertGraph(
          { tenantId: 1, code: 'jennifer', pets: [], favoritePet: { tenantId: 1, petNo: 1 } },
          { unrelate: true, relate: true },
        );

      expect(await getPets()).to.eql([{ tenantId: 1, petNo: 1, ownerCode: null }]);
      expect(await knex('shared_keys_owners')).to.eql([
        { tenantId: 1, code: 'jennifer', favoritePetNo: 1 },
      ]);
    });

    it('upsertGraph() should only clear the belongs-to-one key columns that are not part of the id', async () => {
      for (const owner of [null, { tenantId: 1, code: 'jennifer', '#unrelate': true }]) {
        await knex('shared_keys_pets').update({ ownerCode: 'jennifer' });
        const pet = await bindKnex(Pet)
          .query()
          .upsertGraph({ tenantId: 1, petNo: 1, owner }, { unrelate: true, allowMarkers: true });

        expect(pet.tenantId).to.equal(1);
        expect(await getPets()).to.eql([{ tenantId: 1, petNo: 1, ownerCode: null }]);
        expect(await knex('shared_keys_owners')).to.have.length(1);
      }
    });

    it('upsertGraph() should only clear the belongs-to-one key columns of nested rows that are not part of the id', async () => {
      await knex('shared_keys_owners').update({ favoritePetNo: 1 });
      await bindKnex(Owner)
        .query()
        .upsertGraph(
          { tenantId: 1, code: 'jennifer', favoritePet: { tenantId: 1, petNo: 1, owner: null } },
          { unrelate: true },
        );

      expect(await getPets()).to.eql([{ tenantId: 1, petNo: 1, ownerCode: null }]);
    });

    it('many-to-many patch() should only patch the join rows that match', async () => {
      const owner = await findOwner();
      await owner
        .$relatedQuery('movies')
        .patch({ role: 'Lead' })
        .where('shared_keys_movies.code', 'playbook');

      expect(await getMovieRows()).to.eql([
        { tenantId: 1, ownerCode: 'jennifer', movieCode: 'hunger', role: 'Katniss' },
        { tenantId: 1, ownerCode: 'jennifer', movieCode: 'playbook', role: 'Lead' },
      ]);
    });
  });
};
