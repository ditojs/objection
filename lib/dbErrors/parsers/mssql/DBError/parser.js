import { DBError } from '../../../errors/DBError.js';
import { mssqlErrorCodes } from '../../../errorCodes/mssql.js';
import { getCode } from './util.js';
import { checkViolationErrorParser } from './CheckViolationError/parser.js';
import { dataErrorParser } from './DataError/parser.js';
import { foreignKeyViolationErrorParser } from './ForeignKeyViolationError/parser.js';
import { notNullViolationErrorParser } from './NotNullViolationError/parser.js';
import { uniqueViolationErrorParser } from './UniqueViolationError/parser.js';

export const dbErrorParser = {
  error: DBError,

  parse: (err) => {
    // db-errors was written for the `mssql` package, which wraps the errors of
    // tedious in `originalError`. knex uses tedious directly, so we parse those.
    if (err.code === 'EREQUEST' && mssqlErrorCodes.has(getCode(err))) {
      return {
        nativeError: err,
        client: 'mssql',
      };
    }

    // tedious throws an AggregateError with an empty message when SQL Server
    // reports several errors for one statement, and knex only prepends the SQL
    // to it. Add the messages of its errors, to give the reasons.
    if (isTediousAggregateError(err)) {
      return {
        nativeError: err,
        client: 'mssql',
        message: err.message + err.errors.map((error) => error.message).join(' '),
      };
    }

    return null;
  },

  subclassParsers: [
    checkViolationErrorParser,
    dataErrorParser,
    foreignKeyViolationErrorParser,
    notNullViolationErrorParser,
    uniqueViolationErrorParser,
  ],
};

function isTediousAggregateError(err) {
  return (
    err instanceof AggregateError &&
    err.errors.every((error) => error?.code === 'EREQUEST' && Number.isInteger(error.number))
  );
}
