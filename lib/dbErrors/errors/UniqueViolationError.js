import { ConstraintViolationError } from './ConstraintViolationError.js';

export class UniqueViolationError extends ConstraintViolationError {
  constructor(args) {
    super(args);

    this.table = args.table;
    this.columns = args.columns;
    this.constraint = args.constraint;
    this.schema = args.schema;
  }
}
