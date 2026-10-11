import { ref } from '../../queryBuilder/ReferenceBuilder.js';
import { isEmpty, isObject } from '../../utils/objectUtils.js';
import {
  isFieldExpressionKey,
  toPostgresJsonPathLiteral,
} from '../../utils/parseFieldExpression.js';
import { isKnexRaw, isKnexQueryBuilder } from '../../utils/knexUtils.js';
import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { warnIfNotPostgres } from './jsonApi/postgresJsonApi.js';
import { StaticHookArguments } from '../StaticHookArguments.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { getQueryPropKeys } from '../../model/modelQueryProps.js';

export class UpdateOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.model = null;
    this.modelOptions = Object.assign({}, this.opt.modelOptions || {});
    this.hasNothingToUpdate = false;
  }

  onAdd(builder, args) {
    const json = args[0];
    const modelClass = builder.modelClass();

    this.model = modelClass.ensureModel(json, this.modelOptions);
    return true;
  }

  async onBefore2(builder, result) {
    await callBeforeUpdate(builder, this.model, this.modelOptions);
    return result;
  }

  onBefore3(builder) {
    const row = this.model.$toDatabaseJson(builder);

    if (isEmpty(row)) {
      // Resolve the query if there is nothing to update.
      this.hasNothingToUpdate = !builder.isExplicitlyResolvedOrRejected();
      builder.resolve(0);
    }
  }

  // Returns true if the query was resolved without updating anything, e.g.
  // with `none()` or `resolve()` in a hook, but not if it was only resolved
  // because there is nothing to update in the table, as the update still
  // applies to everything else (#2184).
  isResolvedWithoutUpdate(builder) {
    return builder.isExplicitlyResolvedOrRejected() && !this.hasNothingToUpdate;
  }

  onBuildKnex(knexBuilder, builder) {
    const json = this.model.$toDatabaseJson(builder);

    if (this.modelOptions.patch) {
      return knexBuilder.update(convertFieldExpressionsToRaw(builder, this.model, json));
    } else {
      checkFieldExpressions(builder.modelClass(), this.model);
      return knexBuilder.update(json);
    }
  }

  onAfter2(builder, numUpdated) {
    return callAfterUpdate(builder, this.model, this.modelOptions, numUpdated);
  }

  toFindOperation() {
    return null;
  }

  clone() {
    const clone = super.clone();
    clone.model = this.model;
    clone.hasNothingToUpdate = this.hasNothingToUpdate;
    return clone;
  }
}

// An update replaces whole values, so it can't write into json columns with
// field expressions like `'meta:color'`.
function checkFieldExpressions(modelClass, model) {
  const jsonSchema = modelClass.getJsonSchema();
  const keys = [...Object.keys(model), ...getQueryPropKeys(model)].filter((key) =>
    isFieldExpressionKey(key, jsonSchema?.properties),
  );

  if (keys.length > 0) {
    throw modelClass.createValidationError({
      type: ValidationErrorType.ModelValidation,
      data: Object.fromEntries(
        keys.map((key) => [
          key,
          [{ message: 'field expressions can only be used in patch, not in update' }],
        ]),
      ),
    });
  }
}

async function callBeforeUpdate(builder, model, modelOptions) {
  await callInstanceBeforeUpdate(builder, model, modelOptions);
  return callStaticBeforeUpdate(builder);
}

function callInstanceBeforeUpdate(builder, model, modelOptions) {
  return model.$beforeUpdate(modelOptions, builder.context());
}

function callStaticBeforeUpdate(builder) {
  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeUpdate(args);
}

async function callAfterUpdate(builder, model, modelOptions, result) {
  await callInstanceAfterUpdate(builder, model, modelOptions);
  return callStaticAfterUpdate(builder, result);
}

function callInstanceAfterUpdate(builder, model, modelOptions) {
  return model.$afterUpdate(modelOptions, builder.context());
}

async function callStaticAfterUpdate(builder, result) {
  const args = StaticHookArguments.create({ builder, result });
  const maybeResult = await builder.modelClass().afterUpdate(args);

  if (maybeResult === undefined) {
    return result;
  } else {
    return maybeResult;
  }
}

export function convertFieldExpressionsToRaw(builder, model, json) {
  const knex = builder.knex();
  const declaredColumns = getDeclaredColumns(builder.modelClass());
  const convertedJson = {};

  for (const key of Object.keys(json)) {
    let val = json[key];

    if (isFieldExpressionKey(key, declaredColumns)) {
      // 'col:attr' : ref('other:lol') is transformed to
      // "col" : raw(`jsonb_set("col", '{attr}', to_jsonb("other"#>'{lol}'), true)`)
      warnIfNotPostgres(knex);

      let parsed = ref(key);
      let jsonPath = toPostgresJsonPathLiteral(parsed.parsedExpr.access);
      let valuePlaceholder = '?';

      if (isKnexQueryBuilder(val) || isKnexRaw(val)) {
        valuePlaceholder = 'to_jsonb(?)';
      } else {
        val = JSON.stringify(val);
      }

      convertedJson[parsed.column] = knex.raw(
        `jsonb_set(??, ${jsonPath}, ${valuePlaceholder}, true)`,
        [convertedJson[parsed.column] || parsed.column, val],
      );

      delete model[key];
    } else {
      convertedJson[key] = val;
    }
  }

  return convertedJson;
}

const declaredColumnsByModelClass = new WeakMap();

// The keys of `json` are column names, so map the properties with a ':' that the
// schema declares to their columns, once per model class. Properties that only
// the schema returned by `$beforeValidate()` declares aren't known here.
function getDeclaredColumns(modelClass) {
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
