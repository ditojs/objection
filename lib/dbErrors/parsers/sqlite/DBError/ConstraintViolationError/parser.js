import { ConstraintViolationError } from '../../../../errors/ConstraintViolationError.js';
import { uniqueViolationErrorParser } from './UniqueViolationError/parser.js';
import { notNullViolationErrorParser } from './NotNullViolationError/parser.js';
import { foreignKeyViolationErrorParser } from './ForeignKeyViolationError/parser.js';
import { checkViolationErrorParser } from './CheckViolationError/parser.js';

export const constraintViolationErrorParser = {
  error: ConstraintViolationError,

  parse: (err) => {
    // `better-sqlite3` uses the extended codes, e.g. `SQLITE_CONSTRAINT_UNIQUE`:
    if (/^SQLITE_CONSTRAINT(_|$)/.test(err.code)) {
      return {};
    } else {
      return null;
    }
  },

  subclassParsers: [
    uniqueViolationErrorParser,
    notNullViolationErrorParser,
    foreignKeyViolationErrorParser,
    checkViolationErrorParser,
  ],
};
