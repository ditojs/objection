'use strict';

const { ManyToManyModifyMixin } = require('./ManyToManyModifyMixin');

// We need to override this mixin for mysql because mysql doesn't allow a
// statement that modifies the join table to read the related table in a
// subquery, if a trigger on the join table modifies the related table:
//
//   ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG
//
// Mysql also doesn't allow the join table to be referenced in a subquery of a
// statement that modifies it (ER_UPDATE_TABLE_USED). That one is worked around
// by `WrapMysqlModifySubqueryTransformation` for subqueries, but fetching the
// related ids in a separate query before the main query avoids both errors.
//
// https://stackoverflow.com/a/2314264/3729316
const ManyToManyMySqlModifyMixin = (Operation) => {
  return class extends ManyToManyModifyMixin(Operation) {
    applyModifyFilterForJoinTable(builder) {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const joinTableRelatedRefs = this.relation.joinTableRelatedProp.refs(builder);

      const relatedRefs = this.relation.relatedProp.refs(builder);
      const ownerValues = this.owner.getProps(this.relation);

      const subquery = this.modifyFilterSubquery.clone().select(relatedRefs);

      return builder
        .runBefore(() => subquery.execute())
        .runBefore((related, builder) => {
          if (related.length) {
            builder.whereInComposite(
              joinTableRelatedRefs,
              related.map((model) => this.relation.relatedProp.getProps(model)),
            );
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

module.exports = {
  ManyToManyMySqlModifyMixin,
};
