import { UniqueViolationError } from '../../../../../errors/UniqueViolationError.js';

const CODES = ['ER_DUP_ENTRY', 'ER_DUP_ENTRY_WITH_KEY_NAME'];
const CONSTRAINT_REGEX = /Duplicate entry '(.+)' for key '(.+)'/;

const uniqueViolationErrorParser = {
  error: UniqueViolationError,

  parse: (err) => {
    if (CODES.indexOf(err.code) === -1) {
      return null;
    }

    const constraintMatch = CONSTRAINT_REGEX.exec(err.sqlMessage);

    if (!constraintMatch) {
      return null;
    }

    // No way to reliably get `table` and `columns` from mysql error.
    return {
      constraint: constraintMatch[2],
    };
  },

  subclassParsers: [],
};

export { uniqueViolationErrorParser };
