import { ObjectionToKnexConvertingOperation } from './ObjectionToKnexConvertingOperation.js';

// An operation that simply calls the equivalent knex method.
export class KnexOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    return knexBuilder[this.name].apply(knexBuilder, this.getKnexArgs(builder));
  }
}
