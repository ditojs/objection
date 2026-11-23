'use strict';

const { QueryBuilderOperation } = require('./QueryBuilderOperation');

class UnrelateOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.ids = null;
  }

  // Returns the indices of the key `prop` that unrelating clears, and throws if
  // there are none, see `RelationProperty.getClearedIndices()`.
  getClearedIndices(prop) {
    const indices = prop.getClearedIndices();

    if (indices.length === 0) {
      throw this.relation.createError(
        `unrelate() can't clear the key (${prop.cols.join(', ')}), as it is part of the id of ${prop.modelClass.name}. Delete the related rows instead.`,
      );
    }

    return indices;
  }

  clone() {
    const clone = super.clone();
    clone.ids = this.ids;
    return clone;
  }
}

module.exports = {
  UnrelateOperation,
};
