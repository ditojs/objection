import { NotNullViolationError } from '../../../../errors/NotNullViolationError.js';
import { isCode } from '../util.js';

const REGEX =
  /Cannot insert the value NULL into column '(.+)', table '(.+)\.(.+)\.(.+)'; column does not allow nulls. (?:INSERT|UPDATE) fails./;

const notNullViolationErrorParser = {
  error: NotNullViolationError,

  parse: (err) => {
    if (isCode(err, 16, 515) || isCode(err, 16, 50000)) {
      const match = REGEX.exec(err.originalError.message);

      if (!match) {
        return null;
      }

      return {
        column: match[1],
        database: match[2],
        schema: match[3],
        table: match[4],
      };
    } else {
      return null;
    }
  },

  subclassParsers: [],
};

export { notNullViolationErrorParser };
