import { DBError } from './DBError.js';

class ConstraintViolationError extends DBError {}

export { ConstraintViolationError };
