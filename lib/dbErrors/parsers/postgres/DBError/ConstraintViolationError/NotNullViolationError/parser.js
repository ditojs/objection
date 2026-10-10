import { NotNullViolationError } from '../../../../../errors/NotNullViolationError.js';

export const notNullViolationErrorParser = {
  error: NotNullViolationError,

  parse: (err) => {
    if (err.code === '23502') {
      return {
        table: err.table,
        column: err.column,
      };
    } else {
      return null;
    }
  },

  subclassParsers: [],
};
