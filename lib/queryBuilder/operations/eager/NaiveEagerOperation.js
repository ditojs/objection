import { WhereInEagerOperation } from './WhereInEagerOperation.js';

export class NaiveEagerOperation extends WhereInEagerOperation {
  batchSize() {
    return 1;
  }
}
