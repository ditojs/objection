import { ManyToManyFindOperation } from './find/ManyToManyFindOperation.js';
import { addWhereGroup } from '../../queryBuilder/whereGroups.js';

// This mixin contains the shared code for all modify operations (update, delete, relate, unrelate)
// for ManyToManyRelation operations.
//
// The most important thing this mixin does is that it moves the filters from the main query
// into a subquery and then adds a single where clause that uses the subquery. This is done so
// that we are able to `innerJoin` the join table to the query. Most SQL engines don't allow
// joins in updates or deletes. Join table is joined so that queries can reference the join
// table columns.
export const ManyToManyModifyMixin = (Operation) => {
  return class extends Operation {
    constructor(...args) {
      super(...args);
      this.modifyFilterSubquery = null;
    }

    get modifyMainQuery() {
      return true;
    }

    // At this point `builder` should only have the user's own wheres and joins. There can
    // be other operations (like orderBy) too, but those are meaningless with modify operations.
    onBuild(builder) {
      this.modifyFilterSubquery = this.createModifyFilterSubquery(builder);

      if (this.modifyMainQuery) {
        // We can now remove the where and join statements from the main query.
        this.removeFiltersFromMainQuery(builder);

        // Add a single where clause that uses the created subquery.
        addWhereGroup(builder, () => this.applyModifyFilterForRelatedTable(builder));
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

    // Modifies the join rows of all related rows that match the filters. If the filters
    // reference join table columns, this also modifies join rows that don't match them
    // but share a related row with one that does (#1853). The dialect specific mixins
    // override this to only modify the join rows that match the filters themselves.
    applyModifyFilterForJoinTable(builder) {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const joinTableRelatedRefs = this.relation.joinTableRelatedProp.refs(builder);

      const relatedRefs = this.relation.relatedProp.refs(builder);
      const ownerValues = this.owner.getProps(this.relation);

      const subquery = this.modifyFilterSubquery.clone().select(relatedRefs);

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
      return clone;
    }
  };
};

class ManyToManyModifyFindOperation extends ManyToManyFindOperation {
  onBuild(builder) {
    super.onBuild(builder);
    addWhereGroup(builder, () =>
      this.opt.modifyOperation.applyModifyFilterForRelatedTable(builder),
    );
  }
}
