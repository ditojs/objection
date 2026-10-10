import { ConstraintViolationError } from '../../../../errors/ConstraintViolationError.js';
import { getSqlStateClass } from '../../../../utils/sqlState.js';
import { uniqueViolationErrorParser } from './UniqueViolationError/parser.js';
import { notNullViolationErrorParser } from './NotNullViolationError/parser.js';
import { foreignKeyViolationErrorParser } from './ForeignKeyViolationError/parser.js';

export const constraintViolationErrorParser = {
  error: ConstraintViolationError,

  parse: (err) => {
    if (getSqlStateClass(err.sqlState) === '23' || err.code === 'ER_NO_DEFAULT_FOR_FIELD') {
      return {};
    } else {
      return null;
    }
  },

  subclassParsers: [
    uniqueViolationErrorParser,
    notNullViolationErrorParser,
    foreignKeyViolationErrorParser,
  ],
};
