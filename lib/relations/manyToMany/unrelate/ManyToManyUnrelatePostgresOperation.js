import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManyPostgresModifyMixin } from '../ManyToManyPostgresModifyMixin.js';

export class ManyToManyUnrelatePostgresOperation extends ManyToManyPostgresModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}
