import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { StaticHookArguments } from '../StaticHookArguments.js';
import { isMySql } from '../../utils/knexUtils.js';

export class DeleteOperation extends QueryBuilderOperation {
  async onBefore2(builder, result) {
    await callBeforeDelete(builder);
    return result;
  }

  // knex leaves the offset out of deletes. On MySQL, it leaves out the order as
  // well, but keeps the limit, so the order doesn't pick the deleted rows.
  // Throw when the query is executed.
  onAfterBuild(builder) {
    if (builder.has('offset')) {
      throw new Error('offset() is not supported in delete queries, as knex leaves it out.');
    }
    if (isMySql(builder.knex()) && builder.has('limit') && builder.has(/^orderBy/)) {
      throw new Error(
        'orderBy() is not supported in delete queries with limit() on MySQL, ' +
          'as knex leaves out the order.',
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
