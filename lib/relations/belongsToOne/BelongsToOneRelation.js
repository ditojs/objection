import { Relation } from '../Relation.js';
import { BelongsToOneInsertOperation } from './BelongsToOneInsertOperation.js';
import { BelongsToOneDeleteOperation } from './BelongsToOneDeleteOperation.js';
import { BelongsToOneRelateOperation } from './BelongsToOneRelateOperation.js';
import { BelongsToOneUnrelateOperation } from './BelongsToOneUnrelateOperation.js';

export class BelongsToOneRelation extends Relation {
  isOneToOne() {
    return true;
  }

  insert(_, owner) {
    return new BelongsToOneInsertOperation('insert', {
      relation: this,
      owner,
    });
  }

  delete(_, owner) {
    return new BelongsToOneDeleteOperation('delete', {
      relation: this,
      owner,
    });
  }

  relate(_, owner) {
    return new BelongsToOneRelateOperation('relate', {
      relation: this,
      owner,
    });
  }

  unrelate(_, owner) {
    return new BelongsToOneUnrelateOperation('unrelate', {
      relation: this,
      owner,
    });
  }
}

Object.defineProperties(BelongsToOneRelation.prototype, {
  isObjectionBelongsToOneRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});
