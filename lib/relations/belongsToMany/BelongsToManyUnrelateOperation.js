import { UnrelateOperation } from '../../queryBuilder/operations/UnrelateOperation.js';

export class BelongsToManyUnrelateOperation extends UnrelateOperation {
  // Remove the keys of the related rows that the query finds, so that its
  // `where` clauses and the relation's `modify` filter the related rows.
  queryExecutor(builder) {
    return this.relation
      .findKeys(builder, this.owner)
      .runAfter((keys) => this.relation.updateKeys(builder, this.owner, { remove: keys }));
  }
}
