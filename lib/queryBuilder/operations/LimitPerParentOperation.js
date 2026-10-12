import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { RangeOperation } from './RangeOperation.js';
import { isNumber } from '../../utils/objectUtils.js';
import { withoutSchema } from './select/Selection.js';
import { getWindowOrder, rowNumberColumn } from './windowOrder.js';

// Applies the `limit()`, `offset()` and `first()` of a relation query that
// fetches the related models of many parents to each parent separately.
export class LimitPerParentOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.findOperation = opt.findOperation;
  }

  onBuild(builder) {
    builder.addInternalSelection(rowNumberColumn);
  }

  // Return the limit and offset of the query, built into `knexBuilder` by any
  // of its operations, or `null` if it has none:
  getRange(knexBuilder, builder) {
    // `page()` and `range()` keep limiting all parents, as their total does.
    if (!builder.has(RangeOperation)) {
      const { limit = null, offset = null } = knexBuilder._single;

      if (limit !== null || offset !== null) {
        return { limit, offset: offset ?? 0 };
      }
    }

    return null;
  }

  // Called by `buildKnexQuery()` after the default table and select are set.
  onAfterBuildKnex(knexBuilder, builder) {
    const knex = builder.knex();
    const range = this.getRange(knexBuilder, builder);

    if (!range) {
      return knexBuilder;
    } else {
      const { limit, offset } = range;
      // Number the rows of each parent one level up, aliased as the related
      // table, so that the order can refer to the selected columns and their
      // aliases as in the query itself, e.g. to `id` when a joined table has
      // an `id` too. The order moves into the window function, as SQL Server
      // doesn't allow it in subqueries. An alias can't have a schema.
      const table = withoutSchema(builder.tableRef());
      // knex only accepts raw partitions wrapped in objects:
      const partition = this.findOperation.ownerKeys(builder, table).map((column) => ({ column }));
      const numberedQuery = knex
        .queryBuilder()
        .select('*')
        .rowNumber(rowNumberColumn, (window) =>
          window.orderBy(getWindowOrder(builder, knex, table)).partitionBy(partition),
        )
        .from(
          knexBuilder.clone().clear('with').clear('limit').clear('offset').clear('order').as(table),
        );

      // Select the rows in range with the query itself, to keep its settings
      // like `timeout()`, and its common table expressions.
      knexBuilder
        .clear('select')
        .clear('where')
        .clear('join')
        .clear('union')
        .clear('group')
        .clear('having')
        .clear('order')
        .clear('limit')
        .clear('offset')
        .select('*')
        .from(numberedQuery.as(rowNumberColumn))
        .where(rowNumberColumn, '>', offset)
        .orderBy(rowNumberColumn);

      if (limit !== null) {
        // knex also accepts raw offsets:
        const end = isNumber(offset) ? offset + limit : knex.raw('? + ?', [offset, limit]);
        knexBuilder.where(rowNumberColumn, '<=', end);
      }

      return knexBuilder;
    }
  }
}
