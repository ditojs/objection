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
