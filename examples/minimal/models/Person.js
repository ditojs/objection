import { Model } from 'objection';

export class Person extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'persons';
  }
}
