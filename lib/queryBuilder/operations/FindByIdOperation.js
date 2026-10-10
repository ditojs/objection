import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { assertIdNotUndefined } from '../../utils/assert.js';

class FindByIdOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.id = this.opt.id;
  }

  onAdd(builder, args) {
    if (this.id === null || this.id === undefined) {
      this.id = args[0];
    }

    return super.onAdd(builder, args);
  }

  onBuild(builder) {
    if (!builder.internalOptions().skipUndefined) {
      assertIdNotUndefined(this.id, `undefined was passed to ${this.name}`);
    }

    builder.whereComposite(builder.fullIdColumn(), this.id);
  }

  clone() {
    const clone = super.clone();
    clone.id = this.id;
    return clone;
  }
}

export { FindByIdOperation };
