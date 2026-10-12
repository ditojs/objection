import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation.js';
import { getJsonDialect } from '../../jsonDialects/index.js';
import { parseFieldExpression } from '../../../utils/parseFieldExpression.js';
import { isObject, isString } from '../../../utils/objectUtils.js';
import { isKnexRaw, isKnexQueryBuilder } from '../../../utils/knexUtils.js';

// `whereJsonSupersetOf()`, `whereJsonSubsetOf()` and their variants, and the
// base class of the operations of the other `whereJson*()` methods.
export class WhereJsonOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const dialect = getJsonDialect(builder.knex());
    dialect.checkSupport();
    const [sql, bindings] = this.buildWhere(dialect, this.getKnexArgs(builder));

    if (this.opt.bool === 'or') {
      return knexBuilder.orWhereRaw(sql, bindings);
    } else {
      return knexBuilder.whereRaw(sql, bindings);
    }
  }

  // @overridable
  buildWhere(dialect, args) {
    const [left, right] = args.map((arg) => toJsonOperand(dialect, arg));
    const [sql, bindings] = this.opt.subset
      ? dialect.subset(left, right)
      : dialect.superset(left, right);
    return [this.opt.not ? `not ${sql}` : sql, bindings];
  }
}

function toJsonOperand(dialect, value) {
  if (isString(value)) {
    const { columnName, access } = parseFieldExpression(value);
    return [dialect.jsonOperand(dialect.field('??', access)), [columnName]];
  } else if (isKnexRaw(value) || isKnexQueryBuilder(value)) {
    // ref(), val(), raw() and subqueries, already converted to knex by the operation.
    return [dialect.jsonOperand('?'), [value]];
  } else if (isObject(value)) {
    return [dialect.jsonOperand(dialect.json('?')), [JSON.stringify(value)]];
  } else {
    throw new Error('Invalid right hand expression.');
  }
}
