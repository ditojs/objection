import * as jsonApi from './postgresJsonApi.js';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation.js';
import { parseFieldExpression } from '../../../utils/parseFieldExpression.js';
import { isPlainObject, isString, isFunction } from '../../../utils/objectUtils.js';
import { isMySql } from '../../../utils/knexUtils.js';

class WhereJsonPostgresOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const knex = builder.knex();

    if (isMySql(knex) && this.canDelegateToKnex(knexBuilder)) {
      // On MySQL, knex's version of the method works (ditojs#113). The `or`
      // variants are wrapped in `orWhere()`, as knex < 3 ignores their `or`.
      const [column, value] = this.getKnexArgs(builder);
      const { knexMethod } = this.opt;

      if (this.opt.bool === 'or') {
        return knexBuilder.orWhere((qb) => qb[knexMethod](column, value));
      } else {
        return knexBuilder[knexMethod](column, value);
      }
    }

    jsonApi.warnIfNotPostgres(knex);
    const args = this.getKnexArgs(builder);

    const rawArgs = jsonApi.whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams(
      args[0],
      this.opt.operator,
      args[1],
      this.opt.prefix,
    );

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw.apply(knexBuilder, rawArgs);
    } else {
      knexBuilder = knexBuilder.whereRaw.apply(knexBuilder, rawArgs);
    }

    return knexBuilder;
  }

  // Only the simple form with a plain column and a plain object or array value
  // can be passed on to knex, as knex doesn't understand field expressions.
  canDelegateToKnex(knexBuilder) {
    const [column, value] = this.args;

    return (
      !!this.opt.knexMethod &&
      isFunction(knexBuilder[this.opt.knexMethod]) &&
      isString(column) &&
      parseFieldExpression(column).access.length === 0 &&
      (isPlainObject(value) || Array.isArray(value))
    );
  }
}

export { WhereJsonPostgresOperation };
