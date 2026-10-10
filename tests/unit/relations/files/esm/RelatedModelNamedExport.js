import { Model } from '../../../../../lib/objection.js';

export const someCrap = 42;

export class RelatedModel extends Model {
  static get tableName() {
    return this.name;
  }
}
