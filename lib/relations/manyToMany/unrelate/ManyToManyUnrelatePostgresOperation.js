'use strict';

const { ManyToManyUnrelateOperationBase } = require('./ManyToManyUnrelateOperationBase');
const { ManyToManyPostgresModifyMixin } = require('../ManyToManyPostgresModifyMixin');

class ManyToManyUnrelatePostgresOperation extends ManyToManyPostgresModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}

module.exports = {
  ManyToManyUnrelatePostgresOperation,
};
