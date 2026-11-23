import { QueryTransformation } from './QueryTransformation.js';
import { isMySql } from '../../utils/knexUtils.js';
import { isPlainObject, isString } from '../../utils/objectUtils.js';

/**
 * Mysql doesn't allow queries like this:
 *
 *   update foo set bar = 1 where id in (select id from foo)
 *
 * because the subquery is for the same table `foo` as the parent update query.
 * The same goes for delete queries too.
 *
 * This transformation wraps those subqueries like this:
 *
 *   update foo set bar = 1 where id in (select * from (select id from foo))
 */
export class WrapMysqlModifySubqueryTransformation extends QueryTransformation {
  onConvertQueryBuilderBase(query, parentQuery) {
    const knex = parentQuery.unsafeKnex();

    // Cannot detect anything if, for whatever reason, a knex instance
    // or a transaction is not registered at this point.
    if (!knex) {
      return query;
    }

    // This transformation only applies to MySQL.
    if (!isMySql(knex)) {
      return query;
    }

    // Subqueries in where groups and join clauses are converted with a
    // partial builder as their parent. Use the query that they belong to.
    while (parentQuery.isPartial() && parentQuery.parentQuery()) {
      parentQuery = parentQuery.parentQuery();
    }

    // This transformation only applies to update and delete queries.
    if (!parentQuery.isUpdate() && !parentQuery.isDelete()) {
      return query;
    }

    // If the subquery is for another table and the query doesn't join the
    // parent query's table, we're good to go.
    if (
      parentQuery.tableName() !== query.tableName() &&
      !hasJoinsToTable(query, parentQuery.tableName())
    ) {
      return query;
    }

    return query.modelClass().query().from(query.as('mysql_subquery_fix'));
  }
}

function hasJoinsToTable(query, tableName) {
  let found = false;

  query.forEachOperation(query.constructor.JoinSelector, (op) => {
    if (
      // `joinRelated()` and its variants:
      op.joinsTable
        ? op.joinsTable(query.modelClass(), tableName)
        : getJoinedTableNames(op.args[0]).includes(tableName)
    ) {
      found = true;
      return false;
    }
  });

  return found;
}

// Joins name their table with an optional alias, as `'Person'`,
// `'Person as owner'` or `{ owner: 'Person' }`.
function getJoinedTableNames(table) {
  if (isString(table)) {
    return [table.split(/\s+as\s+/i)[0]];
  } else if (isPlainObject(table)) {
    return Object.values(table);
  } else {
    return [];
  }
}
