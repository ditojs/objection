import { ManyToManyDeleteOperationBase } from './ManyToManyDeleteOperationBase.js';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin.js';

export class ManyToManyDeleteOperation extends ManyToManyModifyMixin(
  ManyToManyDeleteOperationBase,
) {}
