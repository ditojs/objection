import { ref } from '../ReferenceBuilder.js';
import { isObject } from '../../utils/objectUtils.js';
import { getFieldExpressionColumn } from '../../utils/parseFieldExpression.js';
import { isKnexRaw, isKnexQueryBuilder } from '../../utils/knexUtils.js';
import { getJsonDialect } from '../jsonDialects/index.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { getQueryPropKeys } from '../../model/modelQueryProps.js';

// Inserts and updates write whole values, so they can't write into json
// columns with field expressions like `'meta:color'`. Keys with a ':' that don't
// parse as field expressions are columns, as in the query properties.
export function checkFieldExpressions(modelClass, model, operation) {
  const keys = getFieldExpressionKeys(modelClass, [
    ...Object.keys(model),
    ...getQueryPropKeys(model),
  ]);

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

// Field expressions only describe the writes into json columns, they aren't
// properties of the models that the writes return:
export function removeFieldExpressions(modelClass, model) {
  for (const key of getFieldExpressionKeys(modelClass, Object.keys(model))) {
    delete model[key];
  }
}

export function convertFieldExpressionsToRaw(builder, json) {
  const knex = builder.knex();
  const dialect = getJsonDialect(knex);
  const modelClass = builder.modelClass();
  const declaredColumns = getDeclaredColumns(modelClass);
  const convertedJson = {};

  for (const key of Object.keys(json)) {
    let val = json[key];

    if (getFieldExpressionColumn(key, declaredColumns) !== null) {
      // 'col:attr' : ref('other:lol') is transformed to
      // "col" : raw(`jsonb_set("table"."col", '{attr}', to_jsonb("other"#>'{lol}'), true)`)
      // on Postgres, with the column qualified, as it is ambiguous with
      // `excluded` in merge().
      dialect.checkSupport();

      let parsed = ref(key);

      // The field expression would be lost or produce invalid SQL next to a
      // value for the whole json column. Report it with the property names:
      if (Object.prototype.hasOwnProperty.call(json, parsed.column)) {
        const property = modelClass.columnNameToPropertyName(parsed.column);
        throw modelClass.createValidationError({
          type: ValidationErrorType.ModelValidation,
          data: {
            [modelClass.columnNameToPropertyName(key)]: [
              {
                message: `can't be combined with a value for the json column '${property}'`,
                keyword: null,
                params: { property },
              },
            ],
          },
        });
      }

      let valuePlaceholder;

      if (isKnexQueryBuilder(val) || isKnexRaw(val)) {
        valuePlaceholder = dialect.toJson('?');
      } else {
        valuePlaceholder = dialect.json('?');
        val = JSON.stringify(val);
      }

      convertedJson[parsed.column] = knex.raw(
        dialect.set('??', parsed.parsedExpr.access, valuePlaceholder),
        [convertedJson[parsed.column] || `${builder.tableRef()}.${parsed.column}`, val],
      );
    } else {
      convertedJson[key] = val;
    }
  }

  return convertedJson;
}

function getFieldExpressionKeys(modelClass, keys) {
  const jsonSchema = modelClass.getJsonSchema();
  return keys.filter((key) => getFieldExpressionColumn(key, jsonSchema?.properties) !== null);
}

const declaredColumnsByModelClass = new WeakMap();

// The keys of `json` are column names, so map the properties with a ':' that the
// schema declares to their columns, once per model class. Properties that only
// the schema returned by `$beforeValidate()` declares aren't known here.
export function getDeclaredColumns(modelClass) {
  let declaredColumns = declaredColumnsByModelClass.get(modelClass);

  if (!declaredColumns) {
    const jsonSchema = modelClass.getJsonSchema();
    const properties = jsonSchema && jsonSchema.properties;
    declaredColumns = Object.fromEntries(
      (isObject(properties) ? Object.keys(properties) : [])
        .filter((key) => key.includes(':'))
        .map((key) => [modelClass.propertyNameToColumnName(key), true]),
    );
    declaredColumnsByModelClass.set(modelClass, declaredColumns);
  }

  return declaredColumns;
}
