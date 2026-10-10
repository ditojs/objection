import { FindOperation } from './FindOperation.js';
import { assertHasId } from '../../utils/assert.js';

class InstanceFindOperation extends FindOperation {
  constructor(name, opt) {
    super(name, opt);
    this.instance = opt.instance;
  }

  onBuild(builder) {
    assertHasId(this.instance);
    builder.findById(this.instance.$id());
  }
}

export { InstanceFindOperation };
