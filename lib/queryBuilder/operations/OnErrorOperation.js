import { QueryBuilderOperation } from './QueryBuilderOperation.js';

class OnErrorOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_, args) {
    this.func = args[0];
    return true;
  }

  onError(builder, error) {
    return this.func.call(builder, error, builder);
  }

  clone() {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { OnErrorOperation };
