import { isEmpty } from '../../utils/objectUtils.js';
import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { StaticHookArguments } from '../StaticHookArguments.js';
import { removeOverriddenValues } from '../../model/modelQueryProps.js';
import { checkFieldExpressions, convertFieldExpressionsToRaw } from './fieldExpressions.js';

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

  // Returns true if the query was resolved without writing anything, by a hook
  // or because there is nothing to update in the table.
  // @overridable
  isResolvedWithoutWrite(builder) {
    return builder.isExplicitlyResolvedOrRejected();
  }

  // knex leaves the offset out of updates, and on SQL Server the limit as well.
  // Throw when the query is executed.
  onAfterBuild(builder) {
    if (builder.has('offset')) {
      throw new Error('offset() is not supported in update queries, as knex leaves it out.');
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

  async onAfter2(builder, numUpdated) {
    await this.model.$afterUpdate(this.modelOptions, builder.context());
    return numUpdated;
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
