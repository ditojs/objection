import { ConstraintViolationError } from '../../../../errors/ConstraintViolationError.js';
import { uniqueViolationErrorParser } from './UniqueViolationError/parser.js';
import { notNullViolationErrorParser } from './NotNullViolationError/parser.js';
import { foreignKeyViolationErrorParser } from './ForeignKeyViolationError/parser.js';
import { checkViolationErrorParser } from './CheckViolationError/parser.js';

const constraintViolationErrorParser = {
  error: ConstraintViolationError,

  parse: (err) => {
    if (err.code === 'SQLITE_CONSTRAINT') {
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

export { constraintViolationErrorParser };
