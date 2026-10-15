import { ForeignKeyViolationError } from '../../../../../errors/ForeignKeyViolationError.js';
import { getConstraintMessage } from '../constraintMessage.js';

export const foreignKeyViolationErrorParser = {
  error: ForeignKeyViolationError,

  parse: (err) => {
    // No way to extract anything reliably.
    return getConstraintMessage(err, 'FOREIGN KEY') ? {} : null;
  },

  subclassParsers: [],
};
