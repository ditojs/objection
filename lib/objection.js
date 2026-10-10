import { Model as NativeModel } from './model/Model.js';
import { QueryBuilder as NativeQueryBuilder } from './queryBuilder/QueryBuilder.js';
import { AjvValidator as NativeAjvValidator } from './model/AjvValidator.js';
import { Validator as NativeValidator } from './model/Validator.js';
import { inherit } from './utils/classUtils.js';

export {
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  ForeignKeyViolationError,
  ConstraintViolationError,
  CheckViolationError,
  DataError,
} from './dbErrors/index.js';
export { QueryBuilderBase } from './queryBuilder/QueryBuilderBase.js';
export { QueryBuilderOperation } from './queryBuilder/operations/QueryBuilderOperation.js';
export { RelationExpression } from './queryBuilder/RelationExpression.js';
export { ValidationError } from './model/ValidationError.js';
export { NotFoundError } from './model/NotFoundError.js';
export { Relation } from './relations/Relation.js';
export { HasOneRelation } from './relations/hasOne/HasOneRelation.js';
export { HasManyRelation } from './relations/hasMany/HasManyRelation.js';
export { BelongsToOneRelation } from './relations/belongsToOne/BelongsToOneRelation.js';
export { HasOneThroughRelation } from './relations/hasOneThrough/HasOneThroughRelation.js';
export { ManyToManyRelation } from './relations/manyToMany/ManyToManyRelation.js';
export { transaction } from './transaction.js';
export { initialize } from './initialize.js';
export {
  snakeCaseMappers,
  knexSnakeCaseMappers,
  knexIdentifierMapping,
} from './utils/identifierMapping.js';
export { compose, mixin } from './utils/mixin.js';
export { ref } from './queryBuilder/ReferenceBuilder.js';
export { val } from './queryBuilder/ValueBuilder.js';
export { raw } from './queryBuilder/RawBuilder.js';
export { fn } from './queryBuilder/FunctionBuilder.js';

// We need to wrap the classes, that people can inherit, with ES5 classes
// so that babel is able to use ES5 inheritance. sigh... Maybe people
// should stop transpiling node apps to ES5 in the year 2019? Node 6
// with full class support was released three years ago.

export function Model() {
  // Nothing to do here.
}

export function QueryBuilder(...args) {
  NativeQueryBuilder.init(this, ...args);
}

export function Validator(...args) {
  NativeValidator.init(this, ...args);
}

export function AjvValidator(...args) {
  NativeAjvValidator.init(this, ...args);
}

inherit(Model, NativeModel);
inherit(QueryBuilder, NativeQueryBuilder);
inherit(Validator, NativeValidator);
inherit(AjvValidator, NativeAjvValidator);

Model.QueryBuilder = QueryBuilder;
