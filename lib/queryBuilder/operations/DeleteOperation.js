'use strict';

const { QueryBuilderOperation } = require('./QueryBuilderOperation');
const { StaticHookArguments } = require('../StaticHookArguments');
const { isMySql } = require('../../utils/knexUtils');
const { warnOnce } = require('../../utils/warnings');

class DeleteOperation extends QueryBuilderOperation {
  async onBefore2(builder, result) {
    await callBeforeDelete(builder);
    return result;
  }

  // knex leaves the order out of deletes on MySQL, but keeps their limit, so
  // the order doesn't pick the deleted rows. Warn when the query is executed.
  onAfterBuild(builder) {
    if (isMySql(builder.knex()) && builder.has('limit') && builder.has(/^orderBy/)) {
      warnOnce(
        'orderBy() has no effect in delete queries with limit() on MySQL, so the limit ' +
          'deletes rows in any order. This will throw an error in objection 4.0.',
      );
    }
  }

  onBuildKnex(knexBuilder) {
    return knexBuilder.delete();
  }

  onAfter2(builder, result) {
    return callAfterDelete(builder, result);
  }

  toFindOperation() {
    return null;
  }
}

function callBeforeDelete(builder) {
  return callStaticBeforeDelete(builder);
}

function callStaticBeforeDelete(builder) {
  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeDelete(args);
}

function callAfterDelete(builder, result) {
  return callStaticAfterDelete(builder, result);
}

async function callStaticAfterDelete(builder, result) {
  const args = StaticHookArguments.create({ builder, result });
  const maybeResult = await builder.modelClass().afterDelete(args);

  if (maybeResult === undefined) {
    return result;
  } else {
    return maybeResult;
  }
}

module.exports = {
  DeleteOperation,
};
