import { normalizeIds } from '../../utils/normalizeIds.js';
import { RelateOperation } from '../../queryBuilder/operations/RelateOperation.js';

export class BelongsToOneRelateOperation extends RelateOperation {
  onAdd(_, args) {
    this.input = args[0];
    this.ids = normalizeIds(args[0], this.relation.relatedProp, { arrayOutput: true });

    assertOneId(this.ids);
    return true;
  }

  queryExecutor(builder) {
    const patch = {};
    const ownerProp = this.relation.ownerProp;

    ownerProp.forEach((i) => {
      const relatedValue = this.ids[0][i];

      if (this.owner.isModels) {
        for (const owner of this.owner.modelArray) {
          ownerProp.setProp(owner, i, relatedValue);
        }
      }

      ownerProp.patch(patch, i, relatedValue);
    });

    const ownerIdProp = this.relation.ownerModelClass.getIdRelationProperty();
    const ownerIds = this.owner.getProps(this.relation, ownerIdProp);

    return this.relation.ownerModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .modify((query) => {
        if (!this.opt.dontCopyReturning) {
          query.copyFrom(builder, /returning/);
        }
      })
      .whereInComposite(ownerIdProp.refs(builder), ownerIds);
  }
}

function assertOneId(ids) {
  if (ids.length > 1) {
    throw new Error('can only relate one model to a BelongsToOneRelation');
  }
}
