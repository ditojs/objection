import { ConstraintViolationError } from '../../../../errors/ConstraintViolationError.js';
import { getSqlStateClass } from '../../../../utils/sqlState.js';
import { uniqueViolationErrorParser } from './UniqueViolationError/parser.js';
import { notNullViolationErrorParser } from './NotNullViolationError/parser.js';
import { foreignKeyViolationErrorParser } from './ForeignKeyViolationError/parser.js';
import { checkViolationErrorParser } from './CheckViolationError/parser.js';

export const constraintViolationErrorParser = {
  error: ConstraintViolationError,

  parse: (err) => {
    if (getSqlStateClass(err.code) === '23') {
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
