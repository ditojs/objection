import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase.js';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin.js';

export class ManyToManyUpdateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUpdateOperationBase,
) {}
