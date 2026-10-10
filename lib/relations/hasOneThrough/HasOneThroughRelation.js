import { ManyToManyRelation } from '../manyToMany/ManyToManyRelation.js';

export class HasOneThroughRelation extends ManyToManyRelation {
  isOneToOne() {
    return true;
  }
}
