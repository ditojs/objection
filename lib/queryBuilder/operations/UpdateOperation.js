import { ref } from '../../queryBuilder/ReferenceBuilder.js';
import { isEmpty, isObject } from '../../utils/objectUtils.js';
import {
  getFieldExpressionColumn,
  toPostgresJsonPathLiteral,
} from '../../utils/parseFieldExpression.js';
import { isKnexRaw, isKnexQueryBuilder } from '../../utils/knexUtils.js';
import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { warnIfNotPostgres } from './jsonApi/postgresJsonApi.js';
import { StaticHookArguments } from '../StaticHookArguments.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { removeOverriddenValues } from '../../model/modelQueryProps.js';
import { checkFieldExpressions } from './checkFieldExpressions.js';
import { warnOnce } from '../../utils/warnings.js';

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
    removeOverriddenValues(this.model);
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

  // knex leaves the offset out of updates, and on SQL Server the limit as well.
  // Warn when the query is executed.
  onAfterBuild(builder) {
    if (builder.has('offset')) {
      warnOnce(
        'offset() has no effect in update queries, so no rows are skipped, and on SQL Server ' +
          'limit() is ignored too. This will throw an error in objection 4.0.',
      );
    }
  }

  onBuildKnex(knexBuilder, builder) {
    const json = this.model.$toDatabaseJson(builder);

    if (this.modelOptions.patch) {
      return knexBuilder.update(convertFieldExpressionsToRaw(builder, this.model, json));
    } else {
      checkFieldExpressions(builder.modelClass(), this.model, 'update');
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
  const modelClass = builder.modelClass();
  const declaredColumns = getDeclaredColumns(modelClass);
  const convertedJson = {};

  for (const key of Object.keys(json)) {
    let val = json[key];

    if (getFieldExpressionColumn(key, declaredColumns) !== null) {
      // 'col:attr' : ref('other:lol') is transformed to
      // "col" : raw(`jsonb_set("table"."col", '{attr}', to_jsonb("other"#>'{lol}'), true)`)
      // with the column qualified, as it is ambiguous with `excluded` in merge().
      warnIfNotPostgres(knex);

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

      let jsonPath = toPostgresJsonPathLiteral(parsed.parsedExpr.access);
      let valuePlaceholder = '?';

      if (isKnexQueryBuilder(val) || isKnexRaw(val)) {
        valuePlaceholder = 'to_jsonb(?)';
      } else {
        val = JSON.stringify(val);
      }

      convertedJson[parsed.column] = knex.raw(
        `jsonb_set(??, ${jsonPath}, ${valuePlaceholder}, true)`,
        [convertedJson[parsed.column] || `${builder.tableRef()}.${parsed.column}`, val],
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
