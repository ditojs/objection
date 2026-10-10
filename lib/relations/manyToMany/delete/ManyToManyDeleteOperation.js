import { ManyToManyDeleteOperationBase } from './ManyToManyDeleteOperationBase.js';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin.js';

class ManyToManyDeleteOperation extends ManyToManyModifyMixin(ManyToManyDeleteOperationBase) {}

export { ManyToManyDeleteOperation };
