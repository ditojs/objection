import { ManyToManyDeleteOperationBase } from './ManyToManyDeleteOperationBase.js';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin.js';

export class ManyToManyDeleteSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyDeleteOperationBase,
) {}
