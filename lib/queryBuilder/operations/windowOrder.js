import { isString } from '../../utils/objectUtils.js';
import { isKnexRaw } from '../../utils/knexUtils.js';
import { Selection, isSameTable } from './select/Selection.js';

// Without underscores, so that column name mappers don't change it.
export const rowNumberColumn = 'objectiontmprownum';

// Convert the `orderBy()` and `orderByRaw()` calls of the query to the order
// of knex's window functions, which refer to the query's table by `table`.
// Bare columns are qualified with it too, as the window can be in a query that
// joins tables with the same columns.
export function getWindowOrder(builder, knex, table) {
  const order = [];
  const tableRef = builder.tableRef();

  const getAliasedColumn = (column) => {
    const selection = isString(column) && Selection.create(column);
    return selection && (!selection.table || isSameTable(builder, selection.table, tableRef))
      ? `${table}.${selection.column}`
      : column;
  };

  builder.forEachOperation(builder.constructor.OrderBySelector, (op) => {
    const args = op.getKnexArgs(builder);

    if (op.name === 'orderByRaw') {
      const [sql, bindings] = args;
      order.push({ column: isKnexRaw(sql) ? sql : knex.raw(sql, bindings) });
    } else {
      const [column, direction, nulls] = args;
      const items = Array.isArray(column)
        ? column.map((item) => (isString(item) ? { column: item } : item))
        : [{ column, order: direction, nulls }];

      for (const item of items) {
        const aliasedColumn = getAliasedColumn(item.column);

        if (item.nulls) {
          // Not all databases support `nulls first` and `nulls last`:
          order.push({
            column: knex.raw('(case when ? is null then 0 else 1 end)', [
              isString(aliasedColumn) ? knex.ref(aliasedColumn) : aliasedColumn,
            ]),
            order: item.nulls === 'first' ? 'asc' : 'desc',
          });
        }

        // Unlike in `orderBy()`, knex adds the direction to the window as it is:
        order.push({ column: aliasedColumn, order: /^desc$/i.test(item.order) ? 'desc' : 'asc' });
      }
    }
  });

  // SQL Server requires an order in the window function:
  return order.length ? order : [{ column: knex.raw('(select null)') }];
}
