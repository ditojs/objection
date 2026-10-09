'use strict';

const { wrapError, DBError, UniqueViolationError } = require('db-errors');

// db-errors only recognizes mssql unique key violations, but the same error
// number (2627) is also used for primary key violations (#2688).
const MSSQL_PRIMARY_KEY_REGEX =
  /Violation of PRIMARY KEY constraint '(.+)'\. Cannot insert duplicate key in object '(.+)\.(.+)'\. The duplicate key value is \((.+)\)/;

function wrapDbError(err) {
  const wrapped = wrapError(err);

  if (wrapped.constructor === DBError && wrapped.client === 'mssql') {
    const { nativeError } = wrapped;
    const match =
      nativeError.info &&
      nativeError.info.number === 2627 &&
      MSSQL_PRIMARY_KEY_REGEX.exec(nativeError.message);

    if (match) {
      return new UniqueViolationError({
        nativeError,
        client: 'mssql',
        table: match[3],
        schema: match[2],
        constraint: match[1],
      });
    }
  }

  return wrapped;
}

module.exports = {
  wrapDbError,
};
