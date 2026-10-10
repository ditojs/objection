import {
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  ForeignKeyViolationError,
  ConstraintViolationError,
  CheckViolationError,
  DataError,
} from 'db-errors';
import { Model as NativeModel } from './model/Model.js';
import { QueryBuilder as NativeQueryBuilder } from './queryBuilder/QueryBuilder.js';
import { QueryBuilderBase } from './queryBuilder/QueryBuilderBase.js';
import { QueryBuilderOperation } from './queryBuilder/operations/QueryBuilderOperation.js';
import { RelationExpression } from './queryBuilder/RelationExpression.js';
import { ValidationError } from './model/ValidationError.js';
import { NotFoundError } from './model/NotFoundError.js';
import { AjvValidator as NativeAjvValidator } from './model/AjvValidator.js';
import { Validator as NativeValidator } from './model/Validator.js';
import { Relation } from './relations/Relation.js';
import { HasOneRelation } from './relations/hasOne/HasOneRelation.js';
import { HasManyRelation } from './relations/hasMany/HasManyRelation.js';
import { BelongsToOneRelation } from './relations/belongsToOne/BelongsToOneRelation.js';
import { HasOneThroughRelation } from './relations/hasOneThrough/HasOneThroughRelation.js';
import { ManyToManyRelation } from './relations/manyToMany/ManyToManyRelation.js';
import { transaction } from './transaction.js';
import { initialize } from './initialize.js';

import {
  snakeCaseMappers,
  knexSnakeCaseMappers,
  knexIdentifierMapping,
} from './utils/identifierMapping.js';
import { compose, mixin } from './utils/mixin.js';
import { ref } from './queryBuilder/ReferenceBuilder.js';
import { val } from './queryBuilder/ValueBuilder.js';
import { raw } from './queryBuilder/RawBuilder.js';
import { fn } from './queryBuilder/FunctionBuilder.js';
import { inherit } from './utils/classUtils.js';

// We need to wrap the classes, that people can inherit, with ES5 classes
// so that babel is able to use ES5 inheritance. sigh... Maybe people
// should stop transpiling node apps to ES5 in the year 2019? Node 6
// with full class support was released three years ago.

function Model() {
  // Nothing to do here.
}

function QueryBuilder(...args) {
  NativeQueryBuilder.init(this, ...args);
}

function Validator(...args) {
  NativeValidator.init(this, ...args);
}

function AjvValidator(...args) {
  NativeAjvValidator.init(this, ...args);
}

inherit(Model, NativeModel);
inherit(QueryBuilder, NativeQueryBuilder);
inherit(Validator, NativeValidator);
inherit(AjvValidator, NativeAjvValidator);

Model.QueryBuilder = QueryBuilder;

export {
  Model,
  QueryBuilder,
  QueryBuilderBase,
  QueryBuilderOperation,
  RelationExpression,
  ValidationError,
  NotFoundError,
  AjvValidator,
  Validator,
  Relation,
  HasOneRelation,
  HasManyRelation,
  BelongsToOneRelation,
  HasOneThroughRelation,
  ManyToManyRelation,
  transaction,
  initialize,
  compose,
  mixin,
  ref,
  val,
  raw,
  fn,
  snakeCaseMappers,
  knexSnakeCaseMappers,
  knexIdentifierMapping,
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  ForeignKeyViolationError,
  ConstraintViolationError,
  CheckViolationError,
  DataError,
};
