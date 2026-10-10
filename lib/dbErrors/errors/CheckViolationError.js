import { ConstraintViolationError } from './ConstraintViolationError.js';

class CheckViolationError extends ConstraintViolationError {
  constructor(args) {
    super(args);

    this.table = args.table;
    this.constraint = args.constraint;
  }
}

export { CheckViolationError };
