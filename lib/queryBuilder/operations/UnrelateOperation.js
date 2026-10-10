import { QueryBuilderOperation } from './QueryBuilderOperation.js';

class UnrelateOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.ids = null;
  }

  clone() {
    const clone = super.clone();
    clone.ids = this.ids;
    return clone;
  }
}

export { UnrelateOperation };
