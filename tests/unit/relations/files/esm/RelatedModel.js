import { Model } from '../../../../../lib/objection.js';

export default class RelatedModel extends Model {
  static get tableName() {
    return this.name;
  }
}
