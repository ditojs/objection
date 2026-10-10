import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin.js';

class ManyToManyUnrelateOperation extends ManyToManyModifyMixin(ManyToManyUnrelateOperationBase) {
  get modifyMainQuery() {
    return false;
  }
}

export { ManyToManyUnrelateOperation };
