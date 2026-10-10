import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase.js';
import { ManyToManyMySqlModifyMixin } from '../ManyToManyMySqlModifyMixin.js';

class ManyToManyUnrelateMySqlOperation extends ManyToManyMySqlModifyMixin(
  ManyToManyUnrelateOperationBase,
) {}

export { ManyToManyUnrelateMySqlOperation };
