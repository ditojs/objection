import { ConstraintViolationError } from './ConstraintViolationError.js';

class NotNullViolationError extends ConstraintViolationError {
  constructor(args) {
    super(args);

    this.table = args.table;
    this.column = args.column;
    this.schema = args.schema;
    this.database = args.database;
  }
}

export { NotNullViolationError };
