import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManyPostgresModifyMixin } from '../ManyToManyPostgresModifyMixin.js';

class ManyToManyUpdatePostgresOperation extends ManyToManyPostgresModifyMixin(
  ManyToManyUpdateOperationBase,
) {}

export { ManyToManyUpdatePostgresOperation };
