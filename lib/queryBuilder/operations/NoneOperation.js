import { QueryBuilderOperation } from './QueryBuilderOperation.js';

const AggregateSelector =
  /^(count|countDistinct|min|max|sum|sumDistinct|avg|avgDistinct|groupBy\w*)$/;

export class NoneOperation extends QueryBuilderOperation {
  onBefore1(builder, result) {
    // Resolve the query without executing it, like `cancelQuery()` does.
    if (builder.isFind()) {
      // Aggregate queries are executed to get the result the database
      // returns for no rows, e.g. `[{ count: 0 }]`.
      if (!builder.has(AggregateSelector)) {
        builder.resolve([]);
      }
    } else if (builder.isUpdate() || builder.isDelete()) {
      builder.resolve(builder.has(/returning/) ? [] : 0);
    } else {
      throw new Error('none() can only be used with find, update and delete queries');
    }

    return result;
  }

  // Called by `buildKnexQuery()` after all other operations have been
  // built, so that the query matches no rows when it does get executed,
  // for example as a subquery or in `resultSize()`. The existing where
  // clauses are removed so that `orWhere()` calls can't match any rows.
  onAfterBuildKnex(knexBuilder) {
    return knexBuilder.clearWhere().where(false);
  }
}
