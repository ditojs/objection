import { FindOperation } from './FindOperation.js';
import { assertHasId } from '../../utils/assert.js';

export class InstanceFindOperation extends FindOperation {
  constructor(name, opt) {
    super(name, opt);
    this.instance = opt.instance;
  }

  onBuild(builder) {
    assertHasId(this.instance);
    builder.findById(this.instance.$id());
  }
}
