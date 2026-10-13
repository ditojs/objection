import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { StaticHookArguments } from '../StaticHookArguments.js';
import { after, mapAfterAllReturn } from '../../utils/promiseUtils/index.js';
import {
  isSqlite,
  isMySql,
  hasBatchInsert,
  hasBatchInsertDefaults,
  getMaxInsertRows,
} from '../../utils/knexUtils.js';
import { chunk, groupBy, isObject, isPlainObject, isString } from '../../utils/objectUtils.js';
import { removeOverriddenValues } from '../../model/modelQueryProps.js';
import { checkFieldExpressions } from './fieldExpressions.js';

// Base class for all insert operations.
export class InsertOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.models = null;
    this.batches = null;
    this.isArray = false;
    this.modelOptions = Object.assign({}, this.opt.modelOptions || {});
  }

  onAdd(builder, args) {
    const json = args[0];
    const modelClass = builder.modelClass();

    this.isArray = Array.isArray(json);
    this.models = modelClass.ensureModelArray(json, this.modelOptions);

    return true;
  }

  async onBefore2(builder, result) {
    await callBeforeInsert(builder, this.models);

    // Without ids to return, rows can be inserted in batches on all databases.
    // The hooks may give the models their ids, or cancel the query.
    if (
      this.models.length > 1 &&
      !hasBatchInsert(builder.knex()) &&
      !builder.isExplicitlyResolvedOrRejected() &&
      this._hasIdsToReturn(builder)
    ) {
      throw new Error(
        'batch insert only works with Postgresql, SQL Server and SQLite, or with models that have their ids or no idColumn',
      );
    }

    this.models.forEach(removeOverriddenValues);
    return result;
  }

  // Insert the models in several queries if they don't fit into one: Models
  // without any column can't be inserted in batches (#1694), where the database
  // doesn't fill in defaults (SQLite) the rows of a batch need the same columns,
  // and a query can only bind so many values. The queries run in the caller's
  // transaction, if there is one. Without it they are not atomic.
  queryBatches(builder) {
    const models = this.models;
    this.batches = null;

    if (models.length < 2) {
      return null;
    }

    const knex = builder.knex();
    const columnsByModel = new Map(
      models.map((model) => [model, Object.keys(model.$toDatabaseJson(builder))]),
    );
    const batches = [];

    for (const group of groupBy(models, (model) =>
      getColumnsKey(knex, columnsByModel.get(model)),
    ).values()) {
      const columnCount = Math.max(...group.map((model) => columnsByModel.get(model).length));

      if (columnCount === 0) {
        batches.push(...group.map((model) => [model]));
      } else {
        batches.push(...chunk(group, getMaxInsertRows(knex, columnCount)));
      }
    }

    this.batches = batches.length > 1 ? batches : null;
    return this.batches;
  }

  onBuildKnex(knexBuilder, builder) {
    const knex = builder.knex();

    const defaultReturning = getDefaultReturning(builder);

    if (!builder.has(/returning/) && defaultReturning !== null) {
      if (!isSqlite(knex) && !isMySql(knex)) {
        // If the user hasn't specified a `returning` clause, we make sure
        // that at least the identifier is returned. With `onConflict()` the
        // conflict columns are returned too, so that the returned rows can
        // be matched to the models when some of the rows are ignored.
        knexBuilder = knexBuilder.returning(defaultReturning);
      } else if (
        isSqlite(knex) &&
        (builder.has('onConflict') || (this.models.length > 1 && this._hasIdsToReturn(builder)))
      ) {
        // Without a `returning` clause, SQLite returns the id of the last
        // inserted row, which belongs to a previous insert if the row was
        // ignored, and only one id for batch inserts. Use `returning` to find
        // out what was actually inserted.
        knexBuilder = knexBuilder.returning(defaultReturning);
      }
    }

    const modelClass = builder.modelClass();
    // knex leaves arrays unserialized in SQLite inserts, and also objects when
    // it inserts several rows with `select ... union all`.
    const shouldSerialize = isSqlite(knex);

    return knexBuilder.insert(
      (builder._queryBatch || this.models).map((model) => {
        checkFieldExpressions(modelClass, model, 'insert');
        const json = model.$toDatabaseJson(builder);
        return shouldSerialize ? serializeObjects(json) : json;
      }),
    );
  }

  _hasIdsToReturn(builder) {
    return (
      builder.modelClass().getIdColumnArray().length > 0 &&
      !this.models.every((model) => model.$hasId())
    );
  }

  onAfter1(builder, ret) {
    if (!Array.isArray(ret) || !ret.length || ret === this.models) {
      // Early exit if there is nothing to do.
      return this.models;
    }

    const isOnConflict = builder.has('onConflict');
    // The results of the batches are in the order of the batches.
    const models = this.batches ? this.batches.flat() : this.models;

    if (isObject(ret[0])) {
      if (isOnConflict && ret.length !== this.models.length) {
        // With `onConflict()`, ignored rows (and rows not updated because of a
        // `where` clause after `merge()`) are not returned, so the returned rows
        // can't be merged to the models based on their position.
        mergeMatchingRows(builder, this.models, ret);
      } else {
        // If the user specified a `returning` clause the result may be an array of objects.
        // Merge all values of the objects to our models.
        const options = { knex: builder.knex() };
        for (let i = 0, l = models.length; i < l; ++i) {
          models[i].$setDatabaseJson(ret[i], options);
        }
      }
    } else if (builder.modelClass().getIdColumnArray().length > 0) {
      // If the return value is not an array of objects, we assume it is an array of identifiers.
      for (let i = 0, l = models.length; i < l; ++i) {
        const model = models[i];

        // Don't set the id if the model already has one. MySQL and Sqlite don't return the correct
        // primary key value if the id is not generated in db, but given explicitly. With
        // `onConflict()`, MySQL returns `0` for ignored rows, which is not a valid id.
        if (!model.$id() && !(isOnConflict && !ret[i])) {
          model.$id(ret[i]);
        }
      }
    }

    return this.models;
  }

  async onAfter2(builder, models) {
    await callInstanceAfterInsert(builder, this.models);
    return this.isArray ? models : models[0] || null;
  }

  toFindOperation() {
    return null;
  }

  clone() {
    const clone = super.clone();

    clone.models = this.models;
    clone.batches = this.batches;
    clone.isArray = this.isArray;

    return clone;
  }
}

// Rows are only grouped where the database doesn't fill in the defaults of the
// columns that a row leaves out.
function getColumnsKey(knex, columns) {
  return hasBatchInsertDefaults(knex) ? '' : JSON.stringify([...columns].sort());
}

// Returns `null` if there's nothing to return, e.g. for models without an `idColumn`.
function getDefaultReturning(builder) {
  const idColumns = builder.modelClass().getIdColumnArray();
  const columns = Array.from(new Set(idColumns.concat(getConflictColumns(builder))));

  if (columns.length === 0) {
    return null;
  }

  return columns.length === 1 ? columns[0] : columns;
}

function getConflictColumns(builder) {
  if (!builder.has('onConflict')) {
    return [];
  }

  const op = builder.findOperation('onConflict');
  const arg = op.args ? op.args[0] : undefined;
  const columns = Array.isArray(arg) ? arg : [arg];

  // Raw conflict targets (or no target at all) can't be used for matching.
  return columns.every(isString) ? columns : [];
}

// Merges the rows returned by an insert with `onConflict()` into the models with
// matching key values. Models whose rows were not returned are left untouched.
function mergeMatchingRows(builder, models, rows) {
  const jsons = models.map((model) => model.$toDatabaseJson(builder));
  const idColumns = builder.modelClass().getIdColumnArray();

  // Use the conflict columns, or else the identifiers, to match the rows to
  // the models. The columns must be present in the input and the result.
  const keyColumns = [getConflictColumns(builder), idColumns].find((columns) => {
    return (
      columns.length > 0 &&
      columns.every((col) => {
        return (
          rows.every((row) => row[col] !== undefined) &&
          jsons.every((json) => json[col] !== undefined)
        );
      })
    );
  });

  if (!keyColumns) {
    throw createMatchError();
  }

  const createKey = (obj) => JSON.stringify(keyColumns.map((col) => normalizeKey(obj[col])));
  const indicesByKey = new Map();

  jsons.forEach((json, index) => {
    const key = createKey(json);
    const indices = indicesByKey.get(key);

    if (indices) {
      indices.push(index);
    } else {
      indicesByKey.set(key, [index]);
    }
  });

  const options = { knex: builder.knex() };

  for (const row of rows) {
    const indices = indicesByKey.get(createKey(row));
    const index = indices ? indices.shift() : undefined;

    if (index === undefined) {
      throw createMatchError();
    }

    models[index].$setDatabaseJson(row, options);
  }
}

function normalizeKey(value) {
  if (value === null || value === undefined) {
    return null;
  } else if (isObject(value)) {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

function createMatchError() {
  return new Error(
    'Could not match the rows returned by an insert with `onConflict()` to the inserted models. ' +
      'Pass the conflict columns to `onConflict()` and make sure they are returned, or provide ' +
      'the identifiers of the inserted models.',
  );
}

function callBeforeInsert(builder, models) {
  const maybePromise = callInstanceBeforeInsert(builder, models);
  return after(maybePromise, () => callStaticBeforeInsert(builder));
}

function callInstanceBeforeInsert(builder, models) {
  return mapAfterAllReturn(models, (model) => model.$beforeInsert(builder.context()), models);
}

function callStaticBeforeInsert(builder) {
  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeInsert(args);
}

function callInstanceAfterInsert(builder, models) {
  return mapAfterAllReturn(models, (model) => model.$afterInsert(builder.context()), models);
}

function serializeObjects(json) {
  for (const [key, value] of Object.entries(json)) {
    if (isPlainObject(value) || Array.isArray(value)) {
      json[key] = JSON.stringify(value);
    }
  }

  return json;
}
