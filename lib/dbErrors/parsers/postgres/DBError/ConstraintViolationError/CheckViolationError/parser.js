import { CheckViolationError } from '../../../../../errors/CheckViolationError.js';

export const checkViolationErrorParser = {
  error: CheckViolationError,

  parse: (err) => {
    if (err.code === '23514') {
      return {
        table: err.table,
        constraint: err.constraint,
      };
    } else {
      return null;
    }
  },

  subclassParsers: [],
};
