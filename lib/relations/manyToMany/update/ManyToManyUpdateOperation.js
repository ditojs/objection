import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin.js';

class ManyToManyUpdateOperation extends ManyToManyModifyMixin(ManyToManyUpdateOperationBase) {}

export { ManyToManyUpdateOperation };
