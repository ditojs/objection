import { JsonDialect } from './JsonDialect.js';
import { PostgresJsonDialect } from './PostgresJsonDialect.js';
import { MySqlJsonDialect } from './MySqlJsonDialect.js';
import { SqliteJsonDialect } from './SqliteJsonDialect.js';
import { isPostgres, isMySql, isSqlite, isMsSql, isOracle } from '../../utils/knexUtils.js';
import { warnOnce } from '../../utils/warnings.js';

const message =
  'JSON field expressions and the whereJson*() methods of objection are only supported on ' +
  'PostgreSQL, MySQL and SQLite. Use the JSON methods of knex like whereJsonPath() or ' +
  'jsonExtract() with other databases.';

class UnsupportedJsonDialect extends JsonDialect {
  // @override
  checkSupport() {
    throw new Error(message);
  }
}

// Other databases may understand the SQL of Postgres, so only warn:
class UnknownJsonDialect extends PostgresJsonDialect {
  // @override
  checkSupport() {
    warnOnce(message);
  }
}

const postgres = new PostgresJsonDialect();
const mySql = new MySqlJsonDialect();
const sqlite = new SqliteJsonDialect();
const unsupported = new UnsupportedJsonDialect();
const unknown = new UnknownJsonDialect();

export function getJsonDialect(knex) {
  return isPostgres(knex)
    ? postgres
    : isMySql(knex)
      ? mySql
      : isSqlite(knex)
        ? sqlite
        : isMsSql(knex) || isOracle(knex)
          ? unsupported
          : unknown;
}
