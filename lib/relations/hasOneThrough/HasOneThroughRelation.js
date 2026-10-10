import { ManyToManyRelation } from '../manyToMany/ManyToManyRelation.js';

class HasOneThroughRelation extends ManyToManyRelation {
  isOneToOne() {
    return true;
  }
}

export { HasOneThroughRelation };
