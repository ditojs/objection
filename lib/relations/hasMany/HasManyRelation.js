import { Relation } from '../Relation.js';
import { HasManyInsertOperation } from './HasManyInsertOperation.js';
import { HasManyRelateOperation } from './HasManyRelateOperation.js';
import { HasManyUnrelateOperation } from './HasManyUnrelateOperation.js';

export class HasManyRelation extends Relation {
  insert(_, owner) {
    return new HasManyInsertOperation('insert', {
      relation: this,
      owner: owner,
    });
  }

  relate(_, owner) {
    return new HasManyRelateOperation('relate', {
      relation: this,
      owner: owner,
    });
  }

  unrelate(_, owner) {
    return new HasManyUnrelateOperation('unrelate', {
      relation: this,
      owner: owner,
    });
  }

  hasRelateProp(model) {
    return model.$hasId();
  }

  setRelateProp(model, values) {
    model.$id(values);
  }
}

Object.defineProperties(HasManyRelation.prototype, {
  isObjectionHasManyRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});
