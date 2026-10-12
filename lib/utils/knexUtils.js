import { isObject, isFunction } from '../utils/objectUtils.js';

export function getDialect(knex) {
  const type = typeof knex;

  return (
    (knex !== null &&
      (type === 'object' || type === 'function') &&
      knex.client &&
      knex.client.dialect) ||
    null
  );
}

export function isPostgres(knex) {
  return getDialect(knex) === 'postgresql';
}

export function isOracle(knex) {
  const dialect = getDialect(knex);
  return dialect === 'oracle' || dialect === 'oracledb';
}

export function isMySql(knex) {
  const dialect = getDialect(knex);
  return dialect === 'mysql' || dialect === 'mysql2';
}

export function isSqlite(knex) {
  return getDialect(knex) === 'sqlite3';
}

export function isMsSql(knex) {
  return getDialect(knex) === 'mssql';
}

// Postgres, SQL Server and SQLite (through `returning`, since SQLite 3.35)
// return the identifiers of all the rows inserted by one query.
export function hasBatchInsert(knex) {
  return isPostgres(knex) || isMsSql(knex) || isSqlite(knex);
}

// knex inserts the rows of a SQLite batch with `select ... union all`, which
// fills the columns that a row leaves out with NULL, not with their defaults.
export function hasBatchInsertDefaults(knex) {
  return !isSqlite(knex);
}

// The number of rows that fit into one query if each binds `parameters` values.
// SQL Server binds 2100 values, Postgres 65535 and SQLite 999 (32766 since 3.32,
// but builds may be older), and we leave a margin for the values that aren't
// rows. The MySQL drivers inline the values in the query.
export function getMaxRows(knex, parameters) {
  const maxParameters = isMsSql(knex)
    ? 2000
    : isPostgres(knex)
      ? 65000
      : isSqlite(knex)
        ? 900
        : Infinity;
  return Math.max(1, Math.floor(maxParameters / parameters));
}

// The `pg` drivers return `json` and `jsonb` columns parsed, and `text` columns
// as text.
export function isJsonParsedByDriver(knex) {
  return ['pg', 'pgnative', 'cockroachdb'].includes(knex.client.driverName);
}

export function isKnexQueryBuilder(value) {
  return (
    hasConstructor(value) &&
    isFunction(value.select) &&
    isFunction(value.column) &&
    value.select === value.column &&
    'client' in value
  );
}

export function isKnexJoinBuilder(value) {
  return hasConstructor(value) && value.grouping === 'join' && 'joinType' in value;
}

export function isKnexRaw(value) {
  return hasConstructor(value) && value.isRawInstance && 'client' in value;
}

export function isKnexTransaction(knex) {
  return !!getDialect(knex) && isFunction(knex.commit) && isFunction(knex.rollback);
}

function hasConstructor(value) {
  return isObject(value) && isFunction(value.constructor);
}
