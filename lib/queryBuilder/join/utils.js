import { ValidationErrorType } from '../../model/ValidationError.js';
import { isPostgres, isMySql, isMsSql, isSqlite } from '../../utils/knexUtils.js';

export const RELATION_RECURSION_LIMIT = 64;

// The maximum length of the column aliases of the joined relations, after
// which the database would truncate them. Unknown databases use the strictest
// of the known limits, the one of postgres.
export function getIdentifierLengthLimit(knex) {
  if (isPostgres(knex)) {
    return 63;
  } else if (isMySql(knex)) {
    return 256;
  } else if (isMsSql(knex)) {
    return 128;
  } else if (isSqlite(knex)) {
    return Infinity;
  } else {
    return 63;
  }
}

// Given a relation expression, goes through all first level children.
export function forEachChildExpression(expr, modelClass, callback) {
  if (expr.node.$allRecursive || expr.maxRecursionDepth > RELATION_RECURSION_LIMIT) {
    throw modelClass.createValidationError({
      type: ValidationErrorType.RelationExpression,
      message: `recursion depth of eager expression ${expr.toString()} too big for JoinEagerAlgorithm`,
    });
  }

  expr.forEachChildExpression(modelClass, callback);
}
