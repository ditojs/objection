import { QueryBuilderOperation } from './QueryBuilderOperation.js';

class OnBuildKnexOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_, args) {
    this.func = args[0];
    return true;
  }

  onBuildKnex(knexBuilder, builder) {
    return this.func.call(knexBuilder, knexBuilder, builder);
  }

  clone() {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { OnBuildKnexOperation };
