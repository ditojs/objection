import { ConstraintViolationError } from './ConstraintViolationError.js';

export class CheckViolationError extends ConstraintViolationError {
  constructor(args) {
    super(args);

    this.table = args.table;
    this.constraint = args.constraint;
  }
}
