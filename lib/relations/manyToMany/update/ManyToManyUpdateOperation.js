import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin.js';

export class ManyToManyUpdateOperation extends ManyToManyModifyMixin(
  ManyToManyUpdateOperationBase,
) {}
