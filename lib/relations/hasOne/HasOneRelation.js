import { HasManyRelation } from '../hasMany/HasManyRelation.js';

export class HasOneRelation extends HasManyRelation {
  isOneToOne() {
    return true;
  }
}
