import { ForeignKeyViolationError } from '../../../../../errors/ForeignKeyViolationError.js';

export const foreignKeyViolationErrorParser = {
  error: ForeignKeyViolationError,

  parse: (err) => {
    if (err.code === '23503') {
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
