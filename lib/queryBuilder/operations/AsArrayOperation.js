import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { asArray } from '../../utils/objectUtils.js';

// Wrap the result in an array in the order of the operations, so a `first()`
// added after this unwraps it again.
export class AsArrayOperation extends QueryBuilderOperation {
  onAfter3(_, result) {
    return asArray(result);
  }
}
