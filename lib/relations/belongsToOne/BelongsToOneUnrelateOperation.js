import { UnrelateOperation } from '../../queryBuilder/operations/UnrelateOperation.js';

export class BelongsToOneUnrelateOperation extends UnrelateOperation {
  onAdd() {
    const ids = new Array(this.relation.ownerProp.size);

    this.relation.ownerProp.forEach((i) => {
      ids[i] = null;
    });

    this.ids = [ids];
    return true;
  }

  queryExecutor(builder) {
    const { relation, owner } = this;
    const { ownerProp, ownerModelClass } = relation;
    const patch = {};

    ownerProp.forEach((i) => {
      ownerProp.patch(patch, i, this.ids[0][i]);
    });

    const ownerIdProp = ownerModelClass.getIdRelationProperty();
    const ownerRefs = ownerIdProp.refs(builder);
    const ownerIds = owner.getProps(relation, ownerIdProp);
    const isFiltered = !!relation.modify || builder.has(builder.constructor.WhereSelector);

    const clearOwnerKeys = (owners) => {
      for (const owner of owners) {
        ownerProp.forEach((i) => ownerProp.setProp(owner, i, null));
      }
    };

    const query = ownerModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .whereInComposite(ownerRefs, ownerIds);

    if (!isFiltered) {
      if (owner.isModels) {
        clearOwnerKeys(owner.modelArray);
      }
    } else {
      // We are creating a query to the related items. So any `where` statements
      // and the relation's `modify` must filter the *related* items, not the
      // root query above, which is actually for the owners.
      query.whereExists(
        ownerModelClass
          .relatedQuery(relation.name)
          .childQueryOf(builder)
          .copyFrom(builder, builder.constructor.JoinSelector)
          .copyFrom(builder, builder.constructor.WhereSelector),
      );

      if (owner.isModels) {
        // Only clear the keys of the owner models whose related row matched.
        // Unless all or none did, read back which ones the query unrelated:
        query.runAfter(async (numUnrelated) => {
          if (numUnrelated === ownerIds.length) {
            clearOwnerKeys(owner.modelArray);
          } else if (numUnrelated > 0) {
            const keysQuery = ownerModelClass
              .query()
              .childQueryOf(builder)
              .findOptions({ dontCallFindHooks: true });
            const table = keysQuery.tableRefFor(ownerModelClass);
            // Select the whole columns, also for JSON field expressions:
            const rows = await keysQuery
              .select([...ownerRefs, ...ownerProp.cols.map((col) => `${table}.${col}`)])
              .whereInComposite(ownerRefs, ownerIds);
            const unrelatedIds = new Set(
              rows.filter((row) => !ownerProp.hasProps(row)).map((row) => row.$idKey()),
            );

            clearOwnerKeys(owner.modelArray.filter((owner) => unrelatedIds.has(owner.$idKey())));
          }

          return numUnrelated;
        });
      }
    }

    return query;
  }
}
