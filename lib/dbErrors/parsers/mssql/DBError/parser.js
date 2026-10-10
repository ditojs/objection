import { DBError } from '../../../errors/DBError.js';
import { mssqlErrorCodes } from '../../../errorCodes/mssql.js';
import { getCode } from './util.js';
import { checkViolationErrorParser } from './CheckViolationError/parser.js';
import { dataErrorParser } from './DataError/parser.js';
import { foreignKeyViolationErrorParser } from './ForeignKeyViolationError/parser.js';
import { notNullViolationErrorParser } from './NotNullViolationError/parser.js';
import { uniqueViolationErrorParser } from './UniqueViolationError/parser.js';

const dbErrorParser = {
  error: DBError,

  parse: (err) => {
    if (err.originalError && err.code === 'EREQUEST' && mssqlErrorCodes.has(getCode(err))) {
      return {
        nativeError: err.originalError,
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

export { dbErrorParser };
