import { QueryBuilderOperation } from './QueryBuilderOperation.js';

export class RelateOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.input = null;
    this.ids = null;
  }

  clone() {
    const clone = super.clone();

    clone.input = this.input;
    clone.ids = this.ids;

    return clone;
  }
}
