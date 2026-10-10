import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin.js';

class ManyToManyUnrelateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}

export { ManyToManyUnrelateSqliteOperation };
