import { ManyToManyDeleteOperationBase } from './ManyToManyDeleteOperationBase.js';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin.js';

class ManyToManyDeleteSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyDeleteOperationBase,
) {}

export { ManyToManyDeleteSqliteOperation };
