import { describe, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import TestSession from '../../testUtils/TestSession.js';
import misc from './misc/index.js';
import find from './find.js';
import insert from './insert.js';
import insertGraph from './insertGraph.js';
import upsertGraph from './upsertGraph.js';
import update from './update.js';
import patch from './patch.js';
import deleteTests from './delete.js';
import relate from './relate.js';
import unrelate from './unrelate.js';
import manyToManyModify from './manyToManyModify.js';
import withGraph from './withGraph.js';
import transactions from './transactions.js';
import queryContext from './queryContext.js';
import compositeKeys from './compositeKeys.js';
import crossDb from './crossDb/index.js';
import viewsAndAliases from './viewsAndAliases.js';
import schema from './schema.js';
import knexSnakeCase from './knexSnakeCase.js';
import snakeCase from './snakeCase.js';
import knexIdentifierMapping from './knexIdentifierMapping.js';
import GraphInsert from './graph/GraphInsert.js';
import relationModify from './relationModify.js';
import nonPrimaryKeyRelations from './nonPrimaryKeyRelations.js';
import staticHooks from './staticHooks.js';
import modifiers from './modifiers.js';
import toKnexQuery from './toKnexQuery.js';
import relationOwnerGrouping from './relationOwnerGrouping.js';
import jsonQueries from './jsonQueries.js';
import jsonRelations from './jsonRelations.js';
import jsonQueriesMySql from './jsonQueriesMySql.js';

// DATABASES environment variable can contain a comma separated list
// of databases to test.
const DATABASES = (process.env.DATABASES && process.env.DATABASES.split(',')) || [];

// The defaults match the databases in docker-compose.yml. Each setting can be
// overridden with an environment variable, e.g. OBJECTION_TEST_POSTGRES_PORT.
function connection(client, defaults) {
  const settings = ['host', 'port', 'user', 'password', 'database'];
  return Object.fromEntries(
    settings.map((setting) => {
      const name = `OBJECTION_TEST_${client}_${setting}`.toUpperCase();
      return [setting, process.env[name] ?? defaults[setting]];
    }),
  );
}

describe('integration tests', () => {
  const testDatabaseConfigs = [
    {
      client: 'sqlite3',
      useNullAsDefault: true,
      connection: {
        filename: path.join(os.tmpdir(), 'objection_test.db'),
      },
      pool: {
        afterCreate: (conn, cb) => {
          conn.run('PRAGMA foreign_keys = ON', cb);
        },
      },
    },
    {
      client: 'mysql',
      connection: connection('mysql', {
        host: '127.0.0.1',
        port: 33306,
        user: 'objection',
        database: 'objection_test',
      }),
      pool: {
        min: 2,
        max: 10,
        afterCreate: (conn, cb) => {
          conn.query(`SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO'`, (err) => {
            cb(err, conn);
          });
        },
      },
    },
    {
      client: 'postgres',
      connection: connection('postgres', {
        host: '127.0.0.1',
        port: 55432,
        user: 'objection',
        database: 'objection_test',
      }),
    },
  ].filter((it) => {
    return DATABASES.length === 0 || DATABASES.includes(it.client);
  });

  const sessions = testDatabaseConfigs.map((knexConfig) => {
    const session = new TestSession({
      knexConfig,
    });

    describe(knexConfig.client, () => {
      beforeAll(() => {
        return session.createDb();
      });

      misc(session);
      find(session);
      insert(session);
      insertGraph(session);
      upsertGraph(session);
      update(session);
      patch(session);
      deleteTests(session);
      relate(session);
      unrelate(session);
      manyToManyModify(session);
      withGraph(session);
      transactions(session);
      queryContext(session);
      compositeKeys(session);
      crossDb(session);
      viewsAndAliases(session);
      schema(session);
      knexSnakeCase(session);
      snakeCase(session);
      knexIdentifierMapping(session);
      GraphInsert(session);
      relationModify(session);
      nonPrimaryKeyRelations(session);
      staticHooks(session);
      modifiers(session);
      toKnexQuery(session);
      relationOwnerGrouping(session);

      if (session.isPostgres()) {
        jsonQueries(session);
        jsonRelations(session);
      }

      if (session.isMySql()) {
        jsonQueriesMySql(session);
      }
    });

    return session;
  });

  afterAll(() => {
    return Promise.all(
      sessions.map((session) => {
        return session.destroy();
      }),
    );
  });
});
