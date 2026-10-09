'use strict';

const { QueryBuilderOperation } = require('./QueryBuilderOperation');
const { StaticHookArguments } = require('../StaticHookArguments');
const { after, mapAfterAllReturn } = require('../../utils/promiseUtils');
const { isPostgres, isSqlite, isMySql, isMsSql } = require('../../utils/knexUtils');
const { isObject, isString } = require('../../utils/objectUtils');

// Base class for all insert operations.
class InsertOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.models = null;
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
    if (this.models.length > 1 && !isPostgres(builder.knex()) && !isMsSql(builder.knex())) {
      throw new Error('batch insert only works with Postgresql and SQL Server');
    } else {
      await callBeforeInsert(builder, this.models);
      return result;
    }
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
      } else if (isSqlite(knex) && builder.has('onConflict')) {
        // Without a `returning` clause, SQLite returns the id of the last
        // inserted row, which belongs to a previous insert if the row was
        // ignored. Use `returning` to find out what was actually inserted.
        knexBuilder = knexBuilder.returning(defaultReturning);
      }
    }

    return knexBuilder.insert(this.models.map((model) => model.$toDatabaseJson(builder)));
  }

  onAfter1(builder, ret) {
    if (!Array.isArray(ret) || !ret.length || ret === this.models) {
      // Early exit if there is nothing to do.
      return this.models;
    }

    const isOnConflict = builder.has('onConflict');

    if (isObject(ret[0])) {
      if (isOnConflict && ret.length !== this.models.length) {
        // With `onConflict()`, ignored rows (and rows not updated because of a
        // `where` clause after `merge()`) are not returned, so the returned rows
        // can't be merged to the models based on their position.
        mergeMatchingRows(builder, this.models, ret);
      } else {
        // If the user specified a `returning` clause the result may be an array of objects.
        // Merge all values of the objects to our models.
        for (let i = 0, l = this.models.length; i < l; ++i) {
          this.models[i].$setDatabaseJson(ret[i]);
        }
      }
    } else if (builder.modelClass().getIdColumnArray().length > 0) {
      // If the return value is not an array of objects, we assume it is an array of identifiers.
      for (let i = 0, l = this.models.length; i < l; ++i) {
        const model = this.models[i];

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

  onAfter2(builder, models) {
    const result = this.isArray ? models : models[0] || null;
    return callAfterInsert(builder, this.models, result);
  }

  toFindOperation() {
    return null;
  }

  clone() {
    const clone = super.clone();

    clone.models = this.models;
    clone.isArray = this.isArray;

    return clone;
  }
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

  for (const row of rows) {
    const indices = indicesByKey.get(createKey(row));
    const index = indices ? indices.shift() : undefined;

    if (index === undefined) {
      throw createMatchError();
    }

    models[index].$setDatabaseJson(row);
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

function callAfterInsert(builder, models, result) {
  const maybePromise = callInstanceAfterInsert(builder, models);
  return after(maybePromise, () => callStaticAfterInsert(builder, result));
}

function callInstanceAfterInsert(builder, models) {
  return mapAfterAllReturn(models, (model) => model.$afterInsert(builder.context()), models);
}

function callStaticAfterInsert(builder, result) {
  const args = StaticHookArguments.create({ builder, result });
  const maybePromise = builder.modelClass().afterInsert(args);

  return after(maybePromise, (maybeResult) => {
    if (maybeResult === undefined) {
      return result;
    } else {
      return maybeResult;
    }
  });
}

module.exports = {
  InsertOperation,
};
