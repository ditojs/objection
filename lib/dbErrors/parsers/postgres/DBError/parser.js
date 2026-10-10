import { DBError } from '../../../errors/DBError.js';
import { postgresErrorCodes } from '../../../errorCodes/postgres.js';
import { constraintViolationErrorParser } from './ConstraintViolationError/parser.js';
import { dataErrorParser } from './DataError/parser.js';

export const dbErrorParser = {
  error: DBError,

  parse: (err) => {
    if (
      typeof err.code === 'string' &&
      err.code.length === 5 &&
      postgresErrorCodes.has(err.code) &&
      'internalQuery' in err &&
      'table' in err
    ) {
      return {
        nativeError: err,
        client: 'postgres',
      };
    }

    return null;
  },

  subclassParsers: [constraintViolationErrorParser, dataErrorParser],
};
