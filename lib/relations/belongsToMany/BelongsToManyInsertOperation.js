import { RelationInsertOperation } from '../RelationInsertOperation.js';
import { InsertGraphOperation } from '../../queryBuilder/operations/InsertGraphOperation.js';
import { assignRelated } from '../../model/modelSet.js';

export class BelongsToManyInsertOperation extends RelationInsertOperation {
  onAdd(builder, args) {
    const retVal = super.onAdd(builder, args);

    // The owner rows are patched by their ids:
    this.owner.assertModelsHaveProps(
      this.relation,
      'insert',
      this.relation.ownerModelClass.getIdRelationProperty(),
    );

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

    if (this.assignResultToOwner && this.owner.isModels) {
      for (const owner of this.owner.modelArray) {
        assignRelated(owner, this.relation, inserted, { append: true });
      }
    }

    await this.relation.updateKeys(builder, this.owner, {
      add: this.models.map((model) => this.relation.relatedProp.getProp(model, 0)),
    });

    return inserted;
  }
}
