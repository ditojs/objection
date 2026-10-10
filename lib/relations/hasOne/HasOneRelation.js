import { HasManyRelation } from '../hasMany/HasManyRelation.js';

class HasOneRelation extends HasManyRelation {
  isOneToOne() {
    return true;
  }
}

export { HasOneRelation };
