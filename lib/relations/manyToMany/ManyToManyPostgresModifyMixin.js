import { ManyToManyModifyMixin } from './ManyToManyModifyMixin.js';

// Like `ManyToManySqliteModifyMixin`, this identifies the join rows to modify
// by their physical row id, so that only the join rows that match the filters
// are modified (#1853). `tableoid` makes `ctid` unique for partitioned tables.
const ManyToManyPostgresModifyMixin = (Operation) => {
  return class extends ManyToManyModifyMixin(Operation) {
    applyModifyFilterForJoinTable(builder) {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const tableRef = builder.tableRefFor(this.relation.getJoinModelClass(builder));
      const rowIdRefs = [`${tableRef}.tableoid`, `${tableRef}.ctid`];

      const ownerValues = this.owner.getProps(this.relation);
      const subquery = this.modifyFilterSubquery.clone().select(rowIdRefs);

      return builder
        .whereInComposite(rowIdRefs, subquery)
        .whereInComposite(joinTableOwnerRefs, ownerValues);
    }
  };
};

export { ManyToManyPostgresModifyMixin };
