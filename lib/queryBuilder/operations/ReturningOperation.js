'use strict';

const { flatten, isPlainObject } = require('../../utils/objectUtils');
const { ObjectionToKnexConvertingOperation } = require('./ObjectionToKnexConvertingOperation');

// This class's purpose is to normalize the arguments into an array and to
// pass an optional trailing options object (e.g. `includeTriggerModifications`)
// on to knex.
//
// In knex, if a single column is given to `returning` it returns an array with the that column's value
// in it. If an array is given with a one item inside, the return value is an object.
class ReturningOperation extends ObjectionToKnexConvertingOperation {
  constructor(name, opt) {
    super(name, opt);
    this.options = null;
  }

  onAdd(builder, args) {
    args = Array.from(args);

    if (args.length > 1 && isPlainObject(args[args.length - 1])) {
      this.options = args.pop();
    }

    args = flatten(args);

    // Don't add an empty returning list.
    if (args.length === 0) {
      return false;
    }

    return super.onAdd(builder, args);
  }

  onBuildKnex(knexBuilder, builder) {
    // Always pass an array of columns to knex.returning.
    const columns = this.getKnexArgs(builder);

    if (this.options) {
      return knexBuilder.returning(columns, this.options);
    } else {
      return knexBuilder.returning(columns);
    }
  }

  clone() {
    const clone = super.clone();
    clone.options = this.options;
    return clone;
  }
}

module.exports = {
  ReturningOperation,
};
