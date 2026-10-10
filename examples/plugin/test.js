import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Knex from 'knex';
import { Model } from 'objection';
import sessionPlugin from './index.js';

const ISO_DATE_REGEX = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/;

describe('example plugin tests', () => {
  let knex;

  class Person extends sessionPlugin(Model) {
    static get tableName() {
      return 'Person';
    }
  }

  before(async () => {
    knex = Knex({
      client: 'sqlite3',
      useNullAsDefault: true,
      connection: {
        filename: ':memory:',
      },
    });

    await knex.schema.createTable('Person', (table) => {
      table.increments('id').primary();
      table.string('name');
      table.string('createdBy');
      table.string('createdAt');
      table.string('modifiedBy');
      table.string('modifiedAt');
    });
  });

  after(() => knex.destroy());

  beforeEach(() => knex('Person').delete());

  it('should add `createdBy` and `createdAt` properties automatically on insert', async () => {
    const session = {
      userId: 'foo',
    };

    const jennifer = await Person.query(knex).session(session).insert({ name: 'Jennifer' });

    assert.equal(jennifer.createdBy, session.userId);
    assert.match(jennifer.createdAt, ISO_DATE_REGEX);
  });

  it('should add `modifiedBy` and `modifiedAt` properties automatically on update', async () => {
    const jennifer = await Person.query(knex)
      .session({ userId: 'foo' })
      .insert({ name: 'Jennifer' });

    const jonnifer = await jennifer
      .$query(knex)
      .session({ userId: 'bar' })
      .patchAndFetch({ name: 'Jonnifer' });

    assert.equal(jonnifer.createdBy, 'foo');
    assert.match(jonnifer.createdAt, ISO_DATE_REGEX);
    assert.equal(jonnifer.modifiedBy, 'bar');
    assert.match(jonnifer.modifiedAt, ISO_DATE_REGEX);
  });
});
