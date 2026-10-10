import { DBError } from '../../../errors/DBError.js';
import { mysqlErrorCodes } from '../../../errorCodes/mysql.js';
import { constraintViolationErrorParser } from './ConstraintViolationError/parser.js';
import { dataErrorParser } from './DataError/parser.js';

export const dbErrorParser = {
  error: DBError,

  parse: (err) => {
    if (
      typeof err.code === 'string' &&
      'sqlMessage' in err &&
      'sqlState' in err &&
      err.sqlState.length === 5 &&
      mysqlErrorCodes.has(err.code) &&
      typeof err.errno === 'number'
    ) {
      return {
        nativeError: err,
        client: 'mysql',
      };
    }

    return null;
  },

  subclassParsers: [constraintViolationErrorParser, dataErrorParser],
};
