import { NotNullViolationError } from '../../../../../errors/NotNullViolationError.js';
import { getConstraintMessage } from '../constraintMessage.js';

const NOT_COLUMN_REGEX = /^NOT NULL constraint failed: (.+)$/s;

export const notNullViolationErrorParser = {
  error: NotNullViolationError,

  parse: (err) => {
    const message = getConstraintMessage(err, 'NOT NULL');
    const colMatch = message && NOT_COLUMN_REGEX.exec(message);

    if (!colMatch) {
      return null;
    }

    const parts = colMatch[1]
      .trim()
      .split('.')
      .map((it) => it.trim());

    return {
      table: parts[0],
      column: parts[1],
    };
  },

  subclassParsers: [],
};
