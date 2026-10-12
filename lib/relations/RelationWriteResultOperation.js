import { QueryBuilderOperation } from '../queryBuilder/operations/QueryBuilderOperation.js';

// Resolves the rows that writes through `$relatedQuery()` of a to-one relation
// return with `returning()` like its finds: one model, or `undefined`.
export class RelationWriteResultOperation extends QueryBuilderOperation {
  onAfter3(_, result) {
    return Array.isArray(result) && result.length <= 1 ? result[0] : result;
  }

  // Find queries of the write, e.g. `asFindQuery()` in hooks, resolve to all
  // rows that it writes.
  toFindOperation() {
    return null;
  }
}
