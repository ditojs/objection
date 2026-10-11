import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { isPlainObject, isObject, isFunction } from '../../utils/objectUtils.js';
import { isKnexQueryBuilder, isKnexJoinBuilder } from '../../utils/knexUtils.js';
import { transformation } from '../transformations/index.js';
import { getJoinBuilder } from '../getJoinBuilder.js';

// An abstract operation base class that converts all arguments from objection types
// to knex types. For example objection query builders are converted into knex query
// builders and objection RawBuilder instances are converted into knex Raw instances.
export class ObjectionToKnexConvertingOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);
    this.args = null;
  }

  getKnexArgs(builder) {
    return convertArgs(this.name, builder, this.args);
  }

  onAdd(builder, args) {
    this.args = Array.from(args);
    assertNoUndefinedArgs(this.name, this.args);
    return true;
  }

  clone() {
    const clone = super.clone();
    clone.args = this.args;
    return clone;
  }
}

function assertNoUndefinedArgs(opName, args) {
  for (let i = 0, l = args.length; i < l; ++i) {
    if (args[i] === undefined) {
      throw new Error(`undefined passed as argument #${i} for '${opName}' operation.`);
    }
  }
}

function convertArgs(opName, builder, args) {
  return args.map((arg, i) => {
    if (hasToKnexRawMethod(arg)) {
      return convertToKnexRaw(arg, builder);
    } else if (isObjectionQueryBuilderBase(arg)) {
      return convertQueryBuilderBase(arg, builder);
    } else if (isArray(arg)) {
      return convertArray(arg, builder, i, opName);
    } else if (isFunction(arg)) {
      return convertFunction(arg, builder);
    } else if (isModel(arg)) {
      return convertModel(arg);
    } else if (isPlainObject(arg)) {
      return convertPlainObject(arg, builder, i, opName);
    } else {
      return arg;
    }
  });
}

function hasToKnexRawMethod(item) {
  return isObject(item) && isFunction(item.toKnexRaw);
}

function convertToKnexRaw(item, builder) {
  return item.toKnexRaw(builder);
}

function isObjectionQueryBuilderBase(item) {
  return isObject(item) && item.isObjectionQueryBuilderBase === true;
}

function convertQueryBuilderBase(item, builder) {
  item = transformation.onConvertQueryBuilderBase(item, builder);
  return item.subqueryOf(builder).toKnexQuery();
}

function isArray(item) {
  return Array.isArray(item);
}

function convertArray(arr, builder, i, opName) {
  return arr.map((item) => {
    if (item === undefined) {
      throw new Error(`undefined passed as an item in argument #${i} for '${opName}' operation.`);
    } else if (opName === 'orderBy' && isObject(item)) {
      // knex's `orderBy()` only reads `{ column, order, nulls }` objects from arrays,
      // so wrap refs, raws and query builders in one and convert its properties.
      const obj = isPlainObject(item) ? item : { column: item };
      return convertPlainObject(obj, builder, i, opName);
    } else if (hasToKnexRawMethod(item)) {
      return convertToKnexRaw(item, builder);
    } else if (isObjectionQueryBuilderBase(item)) {
      return convertQueryBuilderBase(item, builder);
    } else {
      return item;
    }
  });
}

function convertFunction(func, builder) {
  return function convertedKnexArgumentFunction(...args) {
    if (isKnexQueryBuilder(this)) {
      convertQueryBuilderFunction(this, func, builder);
    } else if (isKnexJoinBuilder(this)) {
      convertJoinBuilderFunction(this, func, builder);
    } else {
      return func.apply(this, args);
    }
  };
}

function convertQueryBuilderFunction(knexQueryBuilder, func, builder) {
  const convertedQueryBuilder = builder.constructor.forClass(builder.modelClass());

  convertedQueryBuilder.isPartial(true).subqueryOf(builder);
  func.call(convertedQueryBuilder, convertedQueryBuilder);

  convertedQueryBuilder.toKnexQuery(knexQueryBuilder);
}

function convertJoinBuilderFunction(knexJoinBuilder, func, builder) {
  const JoinBuilder = getJoinBuilder();
  const joinClauseBuilder = JoinBuilder.forClass(builder.modelClass());

  joinClauseBuilder.isPartial(true).subqueryOf(builder);
  func.call(joinClauseBuilder, joinClauseBuilder);

  joinClauseBuilder.toKnexQuery(knexJoinBuilder);
}

function isModel(item) {
  return isObject(item) && item.$isObjectionModel;
}

function convertModel(model) {
  return model.$toDatabaseJson();
}

function convertPlainObject(obj, builder, i, opName) {
  return Object.keys(obj).reduce((out, key) => {
    const item = obj[key];

    if (item === undefined) {
      throw new Error(
        `undefined passed as a property in argument #${i} for '${opName}' operation.`,
      );
    } else if (hasToKnexRawMethod(item)) {
      out[key] = convertToKnexRaw(item, builder);
    } else if (isObjectionQueryBuilderBase(item)) {
      out[key] = convertQueryBuilderBase(item, builder);
    } else {
      out[key] = item;
    }

    return out;
  }, {});
}
