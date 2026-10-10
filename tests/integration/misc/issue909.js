import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Model, val, raw } from 'objection';

export default (session) => {
  if (!session.isPostgres()) {
    return;
  }

  describe(`Insert an array of UUIDS #909`, () => {
    let knex = session.knex;
    let Person;

    beforeAll(() => {
      return knex.schema.dropTableIfExists('Person').createTable('Person', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.specificType('uuids', 'uuid[]');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('Person');
    });

    beforeAll(() => {
      Person = class Person extends Model {
        static get tableName() {
          return 'Person';
        }
      };

      Person.knex(knex);
    });

    beforeEach(() => Person.query().delete());

    it('should be able to cast to uuid[]', () => {
      const uuids = [randomUUID(), randomUUID()];

      return Person.query()
        .insert({
          name: 'Margot',
          uuids: val(uuids).asArray().castTo('uuid[]'),
        })
        .then(() => {
          return Person.query();
        })
        .then((people) => {
          expect(people).toContainSubset([
            {
              name: 'Margot',
              uuids,
            },
          ]);
        });
    });

    it('should be able to cast individual array items to uuid', () => {
      const uuids = [randomUUID(), randomUUID()];

      return Person.query()
        .insert({
          name: 'Margot',
          uuids: val(uuids.map((it) => val(it).castTo('uuid'))).asArray(),
        })
        .then(() => {
          return Person.query();
        })
        .then((people) => {
          expect(people).toContainSubset([
            {
              name: 'Margot',
              uuids,
            },
          ]);
        });
    });

    it('should be able to give an array of raw instances that are cast to uuid', () => {
      const uuids = [randomUUID(), randomUUID()];

      return Person.query()
        .insert({
          name: 'Margot',
          uuids: val(uuids.map((it) => raw('?::uuid', it))).asArray(),
        })
        .then(() => {
          return Person.query();
        })
        .then((people) => {
          expect(people).toContainSubset([
            {
              name: 'Margot',
              uuids,
            },
          ]);
        });
    });
  });
};
