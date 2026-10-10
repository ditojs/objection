import { WhereInEagerOperation } from './WhereInEagerOperation.js';

class NaiveEagerOperation extends WhereInEagerOperation {
  batchSize() {
    return 1;
  }
}

export { NaiveEagerOperation };
