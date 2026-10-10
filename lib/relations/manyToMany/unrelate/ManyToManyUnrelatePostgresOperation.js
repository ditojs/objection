import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManyPostgresModifyMixin } from '../ManyToManyPostgresModifyMixin.js';

class ManyToManyUnrelatePostgresOperation extends ManyToManyPostgresModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}

export { ManyToManyUnrelatePostgresOperation };
