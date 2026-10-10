import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManyPostgresModifyMixin } from '../ManyToManyPostgresModifyMixin.js';

export class ManyToManyUpdatePostgresOperation extends ManyToManyPostgresModifyMixin(
  ManyToManyUpdateOperationBase,
) {}
