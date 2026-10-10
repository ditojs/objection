import { ForeignKeyViolationError } from '../../../../../errors/ForeignKeyViolationError.js';

const REGEX = /SQLITE_CONSTRAINT: FOREIGN KEY constraint failed/;

export const foreignKeyViolationErrorParser = {
  error: ForeignKeyViolationError,

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
