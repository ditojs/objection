import { normalizeIds } from '../../utils/normalizeIds.js';
import { RelateOperation } from '../../queryBuilder/operations/RelateOperation.js';

export class BelongsToManyRelateOperation extends RelateOperation {
  onAdd(_, args) {
    this.input = args[0];
    this.ids = normalizeIds(args[0], this.relation.relatedProp, { arrayOutput: true });
    return true;
  }

  queryExecutor(builder) {
    return this.relation.updateKeys(builder, this.owner, {
      add: this.ids.map(([key]) => key),
    });
  }
}
