import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation.js';
import { isKnexQueryBuilder } from '../../../utils/knexUtils.js';
import { asSingle } from '../../../utils/objectUtils.js';

export class WhereInCompositeSqliteOperation extends ObjectionToKnexConvertingOperation {
  constructor(name, opt) {
    super(name, opt);
    this.prefix = this.opt.prefix || null;
  }

  onBuildKnex(knexBuilder, builder) {
    const { method, args } = buildWhereArgs(...this.getKnexArgs(builder));

    if (method === 'where') {
      if (this.prefix === 'not') {
        return knexBuilder.whereNot(...args);
      } else {
        return knexBuilder.where(...args);
      }
    } else {
      if (this.prefix === 'not') {
        return knexBuilder.whereNotIn(...args);
      } else {
        return knexBuilder.whereIn(...args);
      }
    }
  }

  clone() {
    const clone = super.clone();
    clone.prefix = this.prefix;
    return clone;
  }
}

function buildWhereArgs(columns, values) {
  if (isCompositeKey(columns)) {
    return buildCompositeArgs(columns, values);
  } else {
    return buildNonCompositeArgs(columns, values);
  }
}

function isCompositeKey(columns) {
  return Array.isArray(columns) && columns.length > 1;
}

function buildCompositeArgs(columns, values) {
  if (!Array.isArray(values)) {
    // If the `values` is not an array of values but a function or a subquery
    // we have no way to implement this method.
    throw new Error(`sqlite doesn't support multi-column where in clauses`);
  }

  if (values.length === 0) {
    // knex turns an empty `whereIn` into `1 = 0` and an empty `whereNotIn`
    // into `1 = 1`.
    return {
      method: 'whereIn',
      args: [columns, []],
    };
  }

  // Sqlite doesn't support the `where in` syntax for multiple columns but
  // we can emulate it using grouped `or` clauses.
  return {
    method: 'where',
    args: [
      (builder) => {
        values.forEach((val) => {
          builder.orWhere((builder) => {
            columns.forEach((col, idx) => {
              builder.andWhere(col, val[idx]);
            });
          });
        });
      },
    ],
  };
}

function buildNonCompositeArgs(columns, values) {
  if (Array.isArray(values)) {
    values = pickNonNull(values, []);
  } else if (!isKnexQueryBuilder(values)) {
    values = [values];
  }

  return {
    method: 'whereIn',
    args: [asSingle(columns), values],
  };
}

function pickNonNull(values, output) {
  for (let i = 0, l = values.length; i < l; ++i) {
    const val = values[i];

    if (Array.isArray(val)) {
      pickNonNull(val, output);
    } else if (val !== null && val !== undefined) {
      output.push(val);
    }
  }

  return output;
}
