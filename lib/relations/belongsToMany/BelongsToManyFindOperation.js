import { RelationFindOperation } from '../RelationFindOperation.js';
import { valuesKey } from '../../model/modelValues.js';
import { groupBy } from '../../utils/objectUtils.js';

export class BelongsToManyFindOperation extends RelationFindOperation {
  // Arrays of keys are what the owner props hold here, see `getKeys()`.
  // @override
  checkOwnerKeys() {}

  // A related model belongs to every owner that holds its key. They keep the
  // order of the query, not the order of the keys in the arrays.
  // @override
  assignRelated(related) {
    const indexByRelated = new Map(related.map((rel, index) => [rel, index]));
    const relatedByKey = groupBy(related, (rel) => this.ownerKeyByRelated.get(rel));

    for (const owner of this.owner.modelArray) {
      const keys = new Set(this.relation.getKeys(owner).map((key) => valuesKey([key])));

      owner[this.relationProperty] = [...keys]
        .flatMap((key) => relatedByKey.get(key) || [])
        .sort((a, b) => indexByRelated.get(a) - indexByRelated.get(b));
    }
  }

  // The related models of all owners come back in one list, without a column
  // to partition them by owner.
  // @override
  ownerKeys() {
    throw this.relation.createError(
      'limit(), offset() and first() are not supported for each owner. Pass ' +
        '`limitPerParent: false` to the graph options to limit all owners together.',
    );
  }
}
