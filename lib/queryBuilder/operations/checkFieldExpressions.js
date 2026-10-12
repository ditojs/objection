import { getFieldExpressionColumn } from '../../utils/parseFieldExpression.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { getQueryPropKeys } from '../../model/modelQueryProps.js';

// Inserts and updates write whole values, so they can't write into json
// columns with field expressions like `'meta:color'`. Keys with a ':' that don't
// parse as field expressions are columns, as in the query properties.
export function checkFieldExpressions(modelClass, model, operation) {
  const jsonSchema = modelClass.getJsonSchema();
  const keys = [...Object.keys(model), ...getQueryPropKeys(model)].filter(
    (key) => getFieldExpressionColumn(key, jsonSchema?.properties) !== null,
  );

  if (keys.length > 0) {
    throw modelClass.createValidationError({
      type: ValidationErrorType.ModelValidation,
      data: Object.fromEntries(
        keys.map((key) => [
          key,
          [{ message: `field expressions can only be used in patch, not in ${operation}` }],
        ]),
      ),
    });
  }
}
