import { DBError } from '../../../errors/DBError.js';
import { constraintViolationErrorParser } from './ConstraintViolationError/parser.js';

const dbErrorParser = {
  error: DBError,

  parse: (err) => {
    if (
      typeof err.code === 'string' &&
      err.code.startsWith('SQLITE_') &&
      typeof err.errno === 'number'
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

export { dbErrorParser };
