import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('insertGraph() with relations through a key that the database generates #853', () => {
    const { knex } = session;

    class Person extends Model {
      static get tableName() {
        return 'issue853_person';
      }

      static get relationMappings() {
        return {
          friends: {
            relation: Model.ManyToManyRelation,
            modelClass: Person,
            join: {
              from: 'issue853_person.uid',
              through: { from: 'issue853_friend.aUid', to: 'issue853_friend.bUid' },
              to: 'issue853_person.uid',
            },
          },
          children: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'issue853_person.id', to: 'issue853_person.parentId' },
          },
        };
      }
    }

    const generateUid = () =>
      session.isPostgres()
        ? knex.raw('gen_random_uuid()::text')
        : session.isMySql()
          ? knex.raw('(uuid())')
          : session.isMsSql()
            ? knex.raw('newid()')
            : knex.raw('(lower(hex(randomblob(16))))');

    const dropTables = () =>
      knex.schema.dropTableIfExists('issue853_friend').dropTableIfExists('issue853_person');

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('issue853_person', (table) => {
          table.increments('id');
          table.string('name');
          table.integer('parentId');
          table.string('uid', 36).defaultTo(generateUid());
        })
        .createTable('issue853_friend', (table) => {
          table.string('aUid', 36);
          table.string('bUid', 36);
        });
    });

    afterAll(dropTables);

    it('should relate the inserted models by the generated key', async () => {
      const person = await Person.query(knex).insertGraph({
        name: 'a',
        friends: [{ name: 'b' }, { name: 'c' }],
      });

      const fetched = await Person.query(knex)
        .findById(person.id)
        .withGraphFetched('friends(orderByName)')
        .modifiers({ orderByName: (query) => query.orderBy('name') });

      expect(fetched.friends.map((friend) => friend.name)).toEqual(['b', 'c']);
      expect(person.uid).toBe(fetched.uid);
    });

    it('should fetch the generated key next to a relation through the id', async () => {
      const person = await Person.query(knex).insertGraph({
        name: 'd',
        friends: [{ name: 'e' }],
        children: [{ name: 'f' }],
      });

      const fetched = await Person.query(knex)
        .findById(person.id)
        .withGraphFetched('[friends, children]');

      expect(fetched.friends.map((friend) => friend.name)).toEqual(['e']);
      expect(fetched.children.map((child) => child.name)).toEqual(['f']);
      expect(person.uid).toBe(fetched.uid);
    });
  });

  describe('upsertGraph() with relations that share a join table #853', () => {
    const { knex } = session;

    const createLink = (linkType) => ({
      relation: Model.ManyToManyRelation,
      modelClass: Node,
      join: {
        from: 'issue853_node.id',
        through: {
          from: 'issue853_link.sourceId',
          to: 'issue853_link.targetId',
          extra: ['linkType'],
          beforeInsert: (link) => {
            link.linkType = linkType;
          },
        },
        to: 'issue853_node.id',
      },
      filter: (query) => query.where('issue853_link.linkType', linkType),
    });

    class Node extends Model {
      static get tableName() {
        return 'issue853_node';
      }

      static get relationMappings() {
        return { outgoing: createLink('outgoing'), incoming: createLink('incoming') };
      }
    }

    const dropTables = () =>
      knex.schema.dropTableIfExists('issue853_link').dropTableIfExists('issue853_node');

    beforeAll(async () => {
      await dropTables();
      await knex.schema
        .createTable('issue853_node', (table) => {
          table.integer('id').primary();
        })
        .createTable('issue853_link', (table) => {
          table.integer('sourceId');
          table.integer('targetId');
          table.string('linkType');
          table.primary(['sourceId', 'targetId', 'linkType']);
        });

      await knex('issue853_node').insert([{ id: 2 }, { id: 3 }]);
      await knex('issue853_link').insert([
        { sourceId: 2, targetId: 3, linkType: 'outgoing' },
        { sourceId: 3, targetId: 2, linkType: 'incoming' },
      ]);
    });

    afterAll(dropTables);

    it('should keep the join rows of each relation', async () => {
      await Node.query(knex).upsertGraph(
        { id: 2, '#id': 'two', outgoing: [{ id: 3, incoming: [{ '#ref': 'two' }] }] },
        { allowRefs: true },
      );

      expect(await knex('issue853_link').orderBy('sourceId')).toEqual([
        { sourceId: 2, targetId: 3, linkType: 'outgoing' },
        { sourceId: 3, targetId: 2, linkType: 'incoming' },
      ]);
    });
  });
};
