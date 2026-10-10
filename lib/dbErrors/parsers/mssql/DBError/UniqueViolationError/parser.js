import { UniqueViolationError } from '../../../../errors/UniqueViolationError.js';
import { isCode } from '../util.js';

const UNIQUE_INDEX_REGEX =
  /Cannot insert duplicate key row in object '(.+)\.(.+)' with unique index '(.+)'. The duplicate key value is (.+)./;
const UNIQUE_CONSTRAINT_REGEX =
  /Violation of UNIQUE KEY constraint '(.+)'. Cannot insert duplicate key in object '(.+)\.(.+)'. The duplicate key value is \((.+)\)/;

// The same error number (2627) is also used for primary key violations (#2688).
const PRIMARY_KEY_REGEX =
  /Violation of PRIMARY KEY constraint '(.+)'. Cannot insert duplicate key in object '(.+)\.(.+)'. The duplicate key value is \((.+)\)/;

// 2601 - Violation in unique index
// 2627 - Violation in unique or primary key constraint (although it is implemented using unique index)

const uniqueViolationErrorParser = {
  error: UniqueViolationError,

  parse: (err) => {
    if (isCode(err, 14, 2627)) {
      const constraintMatch =
        UNIQUE_CONSTRAINT_REGEX.exec(err.originalError.message) ||
        PRIMARY_KEY_REGEX.exec(err.originalError.message);

      if (!constraintMatch) {
        return null;
      }

      return {
        table: constraintMatch[3],
        schema: constraintMatch[2],
        constraint: constraintMatch[1],
      };
    }

    // TODO: this case is missing a test
    if (isCode(err, 14, 2601)) {
      const indexMatch = UNIQUE_INDEX_REGEX.exec(err.originalError.message);

      if (!indexMatch) {
        return null;
      }

      return {
        table: indexMatch[2],
        constraint: indexMatch[3],
        schema: indexMatch[1],
      };
    }

    return null;
  },

  subclassParsers: [],
};

export { uniqueViolationErrorParser };
