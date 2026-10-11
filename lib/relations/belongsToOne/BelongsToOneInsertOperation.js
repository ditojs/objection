import { RelationInsertOperation } from '../RelationInsertOperation.js';
import { BelongsToOneRelateOperation } from './BelongsToOneRelateOperation.js';
import { InsertGraphOperation } from '../../queryBuilder/operations/InsertGraphOperation.js';
import { assignRelated } from '../../model/modelSet.js';

export class BelongsToOneInsertOperation extends RelationInsertOperation {
  onAdd(builder, args) {
    const retVal = super.onAdd(builder, args);

    if (this.models.length > 1) {
      throw this.relation.createError('can only insert one model to a BelongsToOneRelation');
    }

    return retVal;
  }

  async onAfter1(builder, ret) {
    const inserted = await super.onAfter1(builder, ret);

    // A query resolved without executing it, e.g. with `resolve()`, inserted
    // nothing. `insertGraph()` resolves the query itself, but always inserts
    // the graph.
    if (!builder.isExecutable() && !builder.has(InsertGraphOperation)) {
      return inserted;
    }

    const relateOp = new BelongsToOneRelateOperation('relate', {
      dontCopyReturning: true,
      relation: this.relation,
      owner: this.owner,
    });

    if (this.assignResultToOwner && this.owner.isModels) {
      for (const owner of this.owner.modelArray) {
        assignRelated(owner, this.relation, inserted);
      }
    }

    relateOp.onAdd(builder, [inserted]);
    await relateOp.queryExecutor(builder);

    return inserted;
  }
}
