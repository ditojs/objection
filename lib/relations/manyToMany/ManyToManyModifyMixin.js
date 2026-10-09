'use strict';

const { ManyToManyFindOperation } = require('./find/ManyToManyFindOperation');

// This mixin contains the shared code for all modify operations (update, delete, relate, unrelate)
// for ManyToManyRelation operations.
//
// The most important thing this mixin does is that it moves the filters from the main query
// into a subquery and then adds a single where clause that uses the subquery. This is done so
// that we are able to `innerJoin` the join table to the query. Most SQL engines don't allow
// joins in updates or deletes. Join table is joined so that queries can reference the join
// table columns.
//
// Filters for the join table (used by unrelate and for patching join table extras) can't use
// that subquery: it selects related ids, so join rows that share a related id with a matching
// join row would be modified too, even if they don't match the filters themselves (#1853).
// Instead, the filters are applied in a subquery for the related table that doesn't join the
// join table, so that any references to the join table point to the row being modified.
const ManyToManyModifyMixin = (Operation) => {
  return class extends Operation {
    constructor(...args) {
      super(...args);
      this.modifyFilterSubquery = null;
      this.joinTableFilterSubquery = null;
    }

    get modifyMainQuery() {
      return true;
    }

    // At this point `builder` should only have the user's own wheres and joins. There can
    // be other operations (like orderBy) too, but those are meaningless with modify operations.
    onBuild(builder) {
      this.modifyFilterSubquery = this.createModifyFilterSubquery(builder);
      this.joinTableFilterSubquery = this.createJoinTableFilterSubquery(builder);

      if (this.modifyMainQuery) {
        // We can now remove the where and join statements from the main query.
        this.removeFiltersFromMainQuery(builder);

        // Add a single where clause that uses the created subquery.
        this.applyModifyFilterForRelatedTable(builder);
      }

      return super.onBuild(builder);
    }

    createModifyFilterSubquery(builder) {
      const relatedModelClass = this.relation.relatedModelClass;
      const builderClass = builder.constructor;

      // Create an empty subquery.
      const modifyFilterSubquery = relatedModelClass.query().childQueryOf(builder);

      // Add the necessary joins and wheres so that only rows related to
      // `this.owner` are selected.
      this.relation.findQuery(modifyFilterSubquery, this.owner);

      // Copy all where and join statements from the main query to the subquery.
      modifyFilterSubquery
        .copyFrom(builder, builderClass.WhereSelector)
        .copyFrom(builder, builderClass.JoinSelector);

      return modifyFilterSubquery.clearSelect();
    }

    createJoinTableFilterSubquery(builder) {
      const relatedModelClass = this.relation.relatedModelClass;
      const builderClass = builder.constructor;

      // Create an empty subquery that doesn't join the join table, so that
      // references to the join table point to the row being modified.
      const joinTableFilterSubquery = relatedModelClass.query().childQueryOf(builder);
      this.relation.applyModify(joinTableFilterSubquery);

      // Copy all where and join statements from the main query to the subquery.
      joinTableFilterSubquery
        .copyFrom(builder, builderClass.WhereSelector)
        .copyFrom(builder, builderClass.JoinSelector);

      return joinTableFilterSubquery.clearSelect();
    }

    removeFiltersFromMainQuery(builder) {
      const builderClass = builder.constructor;

      builder.clear(builderClass.WhereSelector);
      builder.clear(builderClass.JoinSelector);
    }

    applyModifyFilterForRelatedTable(builder) {
      const idRefs = this.relation.relatedModelClass.getIdRelationProperty().refs(builder);
      const subquery = this.modifyFilterSubquery.clone().select(idRefs);

      return builder.whereInComposite(idRefs, subquery);
    }

    applyModifyFilterForJoinTable(builder) {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const joinTableRelatedRefs = this.relation.joinTableRelatedProp.refs(builder);

      const relatedRefs = this.relation.relatedProp.refs(builder);
      const ownerValues = this.owner.getProps(this.relation);

      const subquery = this.joinTableFilterSubquery.clone().select(relatedRefs);

      return builder
        .whereInComposite(joinTableRelatedRefs, subquery)
        .whereInComposite(joinTableOwnerRefs, ownerValues);
    }

    toFindOperation() {
      const opt = {
        relation: this.relation,
        owner: this.owner,
      };

      if (this.modifyMainQuery && this.modifyFilterSubquery) {
        // `onBuild` has already moved the main query's filters into the
        // subquery and removed them. Apply them to the find query too.
        // See issue #2266.
        return new ManyToManyModifyFindOperation('find', { ...opt, modifyOperation: this });
      } else {
        return new ManyToManyFindOperation('find', opt);
      }
    }

    clone() {
      const clone = super.clone();
      clone.modifyFilterSubquery = this.modifyFilterSubquery;
      clone.joinTableFilterSubquery = this.joinTableFilterSubquery;
      return clone;
    }
  };
};

class ManyToManyModifyFindOperation extends ManyToManyFindOperation {
  onBuild(builder) {
    super.onBuild(builder);
    this.opt.modifyOperation.applyModifyFilterForRelatedTable(builder);
  }
}

module.exports = {
  ManyToManyModifyMixin,
};
