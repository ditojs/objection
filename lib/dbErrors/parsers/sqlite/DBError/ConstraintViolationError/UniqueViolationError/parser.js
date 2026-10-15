import { UniqueViolationError } from '../../../../../errors/UniqueViolationError.js';
import { getConstraintMessage } from '../constraintMessage.js';

const UNIQUE_COLUMNS_REGEX = /^UNIQUE constraint failed: (.+)$/s;

export const uniqueViolationErrorParser = {
  error: UniqueViolationError,

  parse: (err) => {
    const message = getConstraintMessage(err, 'UNIQUE');
    const colsMatch = message && UNIQUE_COLUMNS_REGEX.exec(message);

    if (!colsMatch) {
      return null;
    }

    const cols = colsMatch[1]
      .split(',')
      .map((it) => it.trim())
      .map((it) => it.split('.'))
      .map((it) => it.map((it) => it.trim()));

    return {
      table: cols[0][0],
      columns: cols.map((it) => it[1]),
    };
  },

  subclassParsers: [],
};
