import { DBError } from '../../../errors/DBError.js';
import { constraintViolationErrorParser } from './ConstraintViolationError/parser.js';

export const dbErrorParser = {
  error: DBError,

  parse: (err) => {
    // `sqlite3` gives its errors an `errno`, `better-sqlite3` names them:
    if (
      typeof err.code === 'string' &&
      err.code.startsWith('SQLITE_') &&
      (typeof err.errno === 'number' || err.name === 'SqliteError')
    ) {
      return {
        nativeError: err,
        client: 'sqlite',
      };
    }

    return null;
  },

  subclassParsers: [constraintViolationErrorParser],
};
