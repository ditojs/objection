import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin.js';

class ManyToManyUpdateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUpdateOperationBase,
) {}

export { ManyToManyUpdateSqliteOperation };
