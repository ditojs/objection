const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  describe('upsertGraph() with #ref{} to existing models #356', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'ref_existing_person';
      }

      static get relationMappings() {
        return {
          boss: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ref_existing_person.bossId', to: 'ref_existing_person.id' },
          },
          mentor: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'ref_existing_person.mentorName', to: 'ref_existing_person.name' },
          },
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'ref_existing_person.id', to: 'ref_existing_person.parentId' },
          },
        };
      }
    }

    before(async () => {
      await knex.schema.dropTableIfExists('ref_existing_person');
      await knex.schema.createTable('ref_existing_person', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.integer('bossId');
        table.integer('parentId');
        table.string('mentorName');
      });
    });

    after(() => knex.schema.dropTableIfExists('ref_existing_person'));

    // Truncating resets the ids, which the persons get in the order of insertion:
    beforeEach(async () => {
      await knex('ref_existing_person').truncate();

      for (const name of ['a', 'b', 'c']) {
        await knex('ref_existing_person').insert({ name });
      }
    });

    const getPerson = (id) => knex('ref_existing_person').where('id', id).first();
    const getBoss = () => knex('ref_existing_person').where('name', 'new boss').first();

    it('should read the values that the graph gives them', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 1, boss: { name: 'new boss' } },
          { id: 2, name: 'boss of a: #ref{a.bossId}' },
        ],
        { allowRefs: true },
      );

      const boss = await getBoss();
      expect((await getPerson(2)).name).to.equal(`boss of a: ${boss.id}`);
    });

    it('should not wait for the values that the graph leaves alone', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 1, name: 'a', boss: { '#ref': 'new' } },
          { '#id': 'new', name: 'new boss of #ref{a.name}' },
        ],
        { allowRefs: true, insertMissing: true },
      );

      const boss = await knex('ref_existing_person').where('name', 'new boss of a').first();
      expect((await getPerson(1)).bossId).to.equal(boss.id);
    });

    it('should not wait for the values that relations to them leave alone', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 1, boss: { '#ref': 'a' } },
          { '#id': 'b', id: 2, boss: { name: 'new boss', boss: { '#ref': 'b' } } },
        ],
        { allowRefs: true },
      );

      const boss = await getBoss();
      expect((await getPerson(1)).bossId).to.equal(1);
      expect((await getPerson(2)).bossId).to.equal(boss.id);
      expect(boss.bossId).to.equal(2);
    });

    it('should wait for the values that relations to them join on', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 1, name: 'renamed #ref{n.name}' },
          { id: 2, mentor: { '#ref': 'a' } },
          { '#id': 'n', name: 'new' },
        ],
        { allowRefs: true, insertMissing: true },
      );

      expect((await getPerson(2)).mentorName).to.equal('renamed new');
    });

    it('should read them in related rows', async () => {
      await Person.query(knex).upsertGraph(
        [
          { '#id': 'a', id: 2, boss: { name: 'new boss' } },
          { id: 1, children: [{ id: 3, name: 'boss of a: #ref{a.bossId}' }] },
        ],
        { allowRefs: true, relate: true, noDelete: true },
      );

      const boss = await getBoss();
      expect(await getPerson(3)).to.include({ parentId: 1, name: `boss of a: ${boss.id}` });
    });
  });
};
