'use strict';

const { ManyToManyModifyMixin } = require('./ManyToManyModifyMixin');
const { isObject } = require('../../utils/objectUtils');

// We need to override this mixin for mysql because mysql doesn't allow a
// statement that modifies the join table to read the related table in a
// subquery, if a trigger on the join table modifies the related table:
//
//   ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG
//
// So the join rows that match the filters are fetched in a separate query
// before the main query, which then only modifies these rows (#1853). Mysql
// has no row ids and the join table's primary key isn't known, so the rows are
// identified by the values of all their columns.
//
// https://stackoverflow.com/a/2314264/3729316
const ManyToManyMySqlModifyMixin = (Operation) => {
  return class extends ManyToManyModifyMixin(Operation) {
    applyModifyFilterForJoinTable(builder) {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const tableRef = builder.tableRefFor(this.relation.getJoinModelClass(builder));

      const ownerValues = this.owner.getProps(this.relation);
      const subquery = this.modifyFilterSubquery.clone().select(`${tableRef}.*`);

      return builder
        .runBefore(async (_, builder) => {
          // Fetch the raw rows: no models, so that no hooks run for them.
          const rows = await subquery.toKnexQuery();

          if (rows.length) {
            builder.where((builder) => {
              for (const row of rows) {
                builder.orWhere((builder) => {
                  for (const [column, value] of Object.entries(row)) {
                    builder.whereRaw('?? <=> ?', [
                      `${tableRef}.${column}`,
                      toComparableValue(value),
                    ]);
                  }
                });
              }
            });
          } else {
            // Still execute the query so that it returns the expected
            // result for the dialect, e.g. a count of 0 for deletes.
            builder.where(false);
          }
        })
        .whereInComposite(joinTableOwnerRefs, ownerValues);
    }
  };
};

// Some drivers return JSON columns parsed. Mysql parses strings that are
// compared to JSON columns, so the stringified value matches them again.
function toComparableValue(value) {
  return isObject(value) && !(value instanceof Date) && !Buffer.isBuffer(value)
    ? JSON.stringify(value)
    : value;
}

module.exports = {
  ManyToManyMySqlModifyMixin,
};
