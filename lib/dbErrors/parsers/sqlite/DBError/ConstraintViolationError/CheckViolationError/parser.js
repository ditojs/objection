import { CheckViolationError } from '../../../../../errors/CheckViolationError.js';
import { getConstraintMessage } from '../constraintMessage.js';

export const checkViolationErrorParser = {
  error: CheckViolationError,

  parse: (err) => {
    // No way to extract anything reliably.
    return getConstraintMessage(err, 'CHECK') ? {} : null;
  },

  subclassParsers: [],
};
