import { ConstraintViolationError } from './ConstraintViolationError.js';

class ForeignKeyViolationError extends ConstraintViolationError {
  constructor(args) {
    super(args);

    this.table = args.table;
    this.constraint = args.constraint;
    this.schema = args.schema;
  }
}

export { ForeignKeyViolationError };
