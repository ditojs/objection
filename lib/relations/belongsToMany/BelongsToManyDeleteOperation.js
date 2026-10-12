import { RelationDeleteOperation } from '../RelationDeleteOperation.js';

export class BelongsToManyDeleteOperation extends RelationDeleteOperation {
  // Find the keys of the rows to delete first, to remove them from the owners
  // after the delete.
  async onBefore2(builder, result) {
    result = await super.onBefore2(builder, result);

    if (builder.isExecutable()) {
      this.keys = await this.relation.findKeys(builder, this.owner);
    }

    return result;
  }

  async onAfter1(builder, result) {
    if (this.keys) {
      await this.relation.updateKeys(builder, this.owner, { remove: this.keys });
    }

    return result;
  }
}
