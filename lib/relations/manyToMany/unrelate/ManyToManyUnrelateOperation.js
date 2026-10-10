import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin.js';

export class ManyToManyUnrelateOperation extends ManyToManyModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery() {
    return false;
  }
}
