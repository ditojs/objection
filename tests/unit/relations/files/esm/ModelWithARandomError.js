import { Model } from '../../../../../lib/objection.js';

throw new Error('some random error');

export class TestModel extends Model {
  static get tableName() {
    return 'test';
  }
}
