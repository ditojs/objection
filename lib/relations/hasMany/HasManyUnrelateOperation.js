import { UnrelateOperation } from '../../queryBuilder/operations/UnrelateOperation.js';
import { addWhereGroup } from '../../queryBuilder/whereGroups.js';

class HasManyUnrelateOperation extends UnrelateOperation {
  queryExecutor(builder) {
    const patch = {};
    const relatedProp = this.relation.relatedProp;
    const ownerValues = this.owner.getProps(this.relation);
    const relatedRefs = relatedProp.refs(builder);

    relatedProp.forEach((i) => {
      relatedProp.patch(patch, i, null);
    });

    return this.relation.relatedModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .copyFrom(builder, builder.constructor.JoinSelector)
      .copyFrom(builder, builder.constructor.WhereSelector)
      .modify((query) => {
        addWhereGroup(query, () => query.whereInComposite(relatedRefs, ownerValues));
        addWhereGroup(query, () => query.modify(this.relation.modify));
      });
  }
}

export { HasManyUnrelateOperation };
