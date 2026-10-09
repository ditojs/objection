'use strict';

const { ManyToManyUpdateOperationBase } = require('./ManyToManyUpdateOperationBase');
const { ManyToManyPostgresModifyMixin } = require('../ManyToManyPostgresModifyMixin');

class ManyToManyUpdatePostgresOperation extends ManyToManyPostgresModifyMixin(
  ManyToManyUpdateOperationBase,
) {}

module.exports = {
  ManyToManyUpdatePostgresOperation,
};
