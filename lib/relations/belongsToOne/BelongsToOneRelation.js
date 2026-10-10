'use strict';

const { Relation } = require('../Relation');
const { BelongsToOneInsertOperation } = require('./BelongsToOneInsertOperation');
const { BelongsToOneDeleteOperation } = require('./BelongsToOneDeleteOperation');
const { BelongsToOneRelateOperation } = require('./BelongsToOneRelateOperation');
const { BelongsToOneUnrelateOperation } = require('./BelongsToOneUnrelateOperation');

class BelongsToOneRelation extends Relation {
  isOneToOne() {
    return true;
  }

  // The foreign key is unset when no related model was ever assigned, e.g. on
  // models returned by `insert()` or created with `fromJson()`, where no
  // related model is the right result. This can't be told apart from a
  // foreign key left out of a partial `select()`. Foreign keys that are part
  // of the id are always expected to be set (#132).
  isOptionalOwnerProp(index) {
    return !this.ownerModelClass.getIdPropertyArray().includes(this.ownerProp.props[index]);
  }

  insert(_, owner) {
    return new BelongsToOneInsertOperation('insert', {
      relation: this,
      owner,
    });
  }

  delete(_, owner) {
    return new BelongsToOneDeleteOperation('delete', {
      relation: this,
      owner,
    });
  }

  relate(_, owner) {
    return new BelongsToOneRelateOperation('relate', {
      relation: this,
      owner,
    });
  }

  unrelate(_, owner) {
    return new BelongsToOneUnrelateOperation('unrelate', {
      relation: this,
      owner,
    });
  }
}

Object.defineProperties(BelongsToOneRelation.prototype, {
  isObjectionBelongsToOneRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

module.exports = {
  BelongsToOneRelation,
};
