import { DeleteOperation } from './DeleteOperation.js';
import { InstanceFindOperation } from './InstanceFindOperation.js';
import { assertHasId } from '../../utils/assert.js';
import { addWhereGroup } from '../whereGroups.js';

export class InstanceDeleteOperation extends DeleteOperation {
  constructor(name, opt) {
    super(name, opt);
    this.instance = opt.instance;
  }

  async onBefore2(builder, result) {
    await this.instance.$beforeDelete(builder.context());
    await super.onBefore2(builder, result);
    return result;
  }

  onBuild(builder) {
    super.onBuild(builder);

    assertHasId(this.instance);
    addWhereGroup(builder, () => builder.findById(this.instance.$id()));
  }

  async onAfter2(builder, result) {
    // The result may be an object if `returning` was used.
    if (Array.isArray(result)) {
      result = result[0];
    }

    await this.instance.$afterDelete(builder.context());
    return super.onAfter2(builder, result);
  }

  toFindOperation() {
    return new InstanceFindOperation('find', {
      instance: this.instance,
    });
  }
}
