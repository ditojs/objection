import * as jsonApi from './postgresJsonApi.js';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation.js';

class WhereJsonHasPostgresOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    jsonApi.warnIfNotPostgres(builder.knex());
    const args = this.getKnexArgs(builder);

    const rawArgs = jsonApi.whereJsonFieldRightStringArrayOnLeftQuery(
      builder.knex(),
      args[0],
      this.opt.operator,
      args[1],
    );

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw(...rawArgs);
    } else {
      knexBuilder = knexBuilder.whereRaw(...rawArgs);
    }

    return knexBuilder;
  }
}

export { WhereJsonHasPostgresOperation };
