import * as jsonFieldExpressionParser from '../queryBuilder/parsers/jsonFieldExpressionParser.js';
import { isObject, hasOwn } from './objectUtils.js';
const cache = new Map();

export function parseFieldExpression(expr) {
  let parsedExpr = cache.get(expr);

  if (parsedExpr !== undefined) {
    return parsedExpr;
  } else {
    parsedExpr = jsonFieldExpressionParser.parse(expr);
    parsedExpr = preprocessParsedExpression(parsedExpr);

    // We don't take a copy of the parsedExpr each time we
    // use if from cache. Instead to make sure it's never
    // mutated we deep-freeze it.
    parsedExpr = freezeParsedExpr(parsedExpr);

    cache.set(expr, parsedExpr);
    return parsedExpr;
  }
}

function preprocessParsedExpression(parsedExpr) {
  const columnParts = parsedExpr.columnName.split('.').map((part) => part.trim());
  parsedExpr.column = columnParts[columnParts.length - 1];

  if (columnParts.length >= 2) {
    parsedExpr.table = columnParts.slice(0, columnParts.length - 1).join('.');
  } else {
    parsedExpr.table = null;
  }

  return parsedExpr;
}

function freezeParsedExpr(parsedExpr) {
  for (const access of parsedExpr.access) {
    Object.freeze(access);
  }

  Object.freeze(parsedExpr.access);
  Object.freeze(parsedExpr);

  return parsedExpr;
}

// Keys with a ':' in the data of patches and updates are field expressions like
// `'meta:a.b'` that write into json columns, unless they are `declared`: the
// `properties` of the schema, or an object with their column names as keys.
export function isFieldExpressionKey(key, declared) {
  return key.includes(':') && !(isObject(declared) && hasOwn(declared, key));
}

// Returns the json column of a field expression key like `'meta:a'`, or `null`
// if the key isn't a field expression or doesn't parse as one.
export function getFieldExpressionColumn(key, declared) {
  if (isFieldExpressionKey(key, declared)) {
    try {
      return parseFieldExpression(key).column;
    } catch (err) {
      return null;
    }
  } else {
    return null;
  }
}

// Formats the json path of a parsed field expression as a Postgres text array
// literal, e.g. `{a,"",b}`. Keys that would otherwise be misread (empty keys,
// keys with whitespace, delimiters, quotes or backslashes and `NULL`) are
// double-quoted, with quotes and backslashes escaped.
export function toPostgresJsonPath(access) {
  const keys = access.map(({ ref }) => {
    const key = String(ref);
    return key === '' || /[{}",\\\s]/.test(key) || key.toUpperCase() === 'NULL'
      ? `"${key.replace(/["\\]/g, '\\$&')}"`
      : key;
  });
  return `{${keys.join(',')}}`;
}

// Formats the json path of a parsed field expression as a quoted string literal
// to be used in raw knex SQL, e.g. `'{a,b}'`.
export function toPostgresJsonPathLiteral(access) {
  return toPostgresStringLiteral(toPostgresJsonPath(access));
}

// Formats a string as a quoted literal to be used in raw knex SQL. Paths and
// keys can't be passed as bindings, as knex doesn't keep the order of bindings
// in raw columns (e.g. in `whereIn(ref(...), values)`), so they need to be
// escaped instead: single quotes are doubled, and `?` is escaped so that knex
// doesn't read it as a binding placeholder. Strings with backslashes use an
// escape string literal in which they are written as `\134`: so they can't
// escape the closing quote, whatever `standard_conforming_strings` is set to,
// and knex's Postgres dialect, which drops all backslashes in front of an
// escaped `?`, can't drop them either.
export function toPostgresStringLiteral(str) {
  const value = str.replace(/'/g, "''");
  return value.includes('\\')
    ? `E'${value.replace(/\\/g, '\\134').replace(/\?/g, '\\?')}'`
    : `'${value.replace(/\?/g, '\\?')}'`;
}

// Formats the json path of a parsed field expression as a SQL/JSON path like
// `$."a"[0]`, as MySQL and SQLite use it. Keys are always quoted, so that they
// can't be misread.
export function toJsonPath(access) {
  const path = access.map(({ type, ref }) =>
    type === 'array' ? `[${ref}]` : `.${JSON.stringify(String(ref))}`,
  );
  return `$${path.join('')}`;
}
