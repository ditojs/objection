import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManyMySqlModifyMixin } from '../ManyToManyMySqlModifyMixin.js';

class ManyToManyUpdateMySqlOperation extends ManyToManyMySqlModifyMixin(
  ManyToManyUpdateOperationBase,
) {}

export { ManyToManyUpdateMySqlOperation };
