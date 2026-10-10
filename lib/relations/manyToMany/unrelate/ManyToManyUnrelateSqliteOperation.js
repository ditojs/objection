import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin.js';

export class ManyToManyUnrelateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}
