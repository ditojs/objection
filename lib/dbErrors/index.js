/**
 * Vendored from db-errors 0.2.3 (https://github.com/Vincit/db-errors),
 * converted to ES modules, with support for mssql primary key violations.
 *
 * Copyright (c) 2017 Vincit
 * Released under the MIT license, see ./LICENSE
 */

import { dbErrorParser as postgresParser } from './parsers/postgres/DBError/parser.js';
import { dbErrorParser as sqliteParser } from './parsers/sqlite/DBError/parser.js';
import { dbErrorParser as mysqlParser } from './parsers/mysql/DBError/parser.js';
import { dbErrorParser as mssqlParser } from './parsers/mssql/DBError/parser.js';

import { DBError } from './errors/DBError.js';
import { ConstraintViolationError } from './errors/ConstraintViolationError.js';
import { ForeignKeyViolationError } from './errors/ForeignKeyViolationError.js';
import { NotNullViolationError } from './errors/NotNullViolationError.js';
import { UniqueViolationError } from './errors/UniqueViolationError.js';
import { CheckViolationError } from './errors/CheckViolationError.js';
import { DataError } from './errors/DataError.js';

// The parsers are tried in this order.
const parsers = [postgresParser, sqliteParser, mysqlParser, mssqlParser];

function wrapError(err) {
  for (let i = 0, l = parsers.length; i < l; ++i) {
    const result = parse(parsers[i], err, null);

    if (result !== null) {
      return new result.node.error(result.args);
    }
  }

  return err;
}

function parse(node, err, parentResult) {
  const args = node.parse(err);

  if (args === null) {
    return null;
  }

  const result = {
    node,
    args: Object.assign({}, parentResult && parentResult.args, args),
  };

  for (let i = 0; i < node.subclassParsers.length; ++i) {
    const subResult = parse(node.subclassParsers[i], err, result);

    if (subResult !== null) {
      return subResult;
    }
  }

  return result;
}

export {
  wrapError,
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  ForeignKeyViolationError,
  ConstraintViolationError,
  CheckViolationError,
  DataError,
};
