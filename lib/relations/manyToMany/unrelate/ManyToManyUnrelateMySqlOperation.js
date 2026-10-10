import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManyMySqlModifyMixin } from '../ManyToManyMySqlModifyMixin.js';

class ManyToManyUnrelateMySqlOperation extends ManyToManyMySqlModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}

export { ManyToManyUnrelateMySqlOperation };
