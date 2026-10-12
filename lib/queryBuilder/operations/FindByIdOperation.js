import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { assertIdNotUndefined } from '../../utils/assert.js';

export class FindByIdOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.id = this.opt.id;
    // Keep the id condition in its own where group, so that it applies to
    // whatever the user adds, `orWhere()` included. See `whereGroups.js`.
    this.whereGroup = {};
  }

  onAdd(builder, args) {
    if (this.id === null || this.id === undefined) {
      this.id = args[0];
    }

    return super.onAdd(builder, args);
  }

  onBuild(builder) {
    assertIdNotUndefined(this.id, `undefined was passed to ${this.name}`);

    builder.whereComposite(builder.fullIdColumn(), this.id);
  }

  clone() {
    const clone = super.clone();
    clone.id = this.id;
    return clone;
  }
}
