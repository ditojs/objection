import { QueryBuilderOperation } from './QueryBuilderOperation.js';

export class RunAfterOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_, args) {
    this.func = args[0];
    return true;
  }

  clone() {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}
