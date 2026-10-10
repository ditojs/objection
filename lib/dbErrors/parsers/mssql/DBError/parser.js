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
