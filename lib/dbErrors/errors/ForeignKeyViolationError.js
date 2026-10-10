import { ConstraintViolationError } from './ConstraintViolationError.js';

export class ForeignKeyViolationError extends ConstraintViolationError {
  constructor(args) {
    super(args);

    this.table = args.table;
    this.constraint = args.constraint;
    this.schema = args.schema;
  }
}
