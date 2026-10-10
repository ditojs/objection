import { CheckViolationError } from '../../../../../errors/CheckViolationError.js';

const REGEX = /SQLITE_CONSTRAINT: CHECK constraint failed/;

export const checkViolationErrorParser = {
  error: CheckViolationError,

  parse: (err) => {
    const match = REGEX.exec(err.message);

    if (!match) {
      return null;
    }

    // No way to extract anything reliably.
    return {};
  },

  subclassParsers: [],
};
