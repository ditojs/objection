import { parseFieldExpression } from '../utils/parseFieldExpression.js';
import { isObject } from '../utils/objectUtils.js';
import { getJsonDialect } from './jsonDialects/index.js';

export class ReferenceBuilder {
  constructor(expr) {
    this._expr = expr;
    this._parsedExpr = null;
    this._column = null;
    this._table = null;
    this._cast = null;
    this._toJson = false;
    this._table = null;
    this._alias = null;
    this._modelClass = null;

    // This `if` makes it possible for `clone` to skip
    // parsing the expression again.
    if (expr !== null) {
      this._parseExpression(expr);
    }
  }

  get parsedExpr() {
    return this._parsedExpr;
  }

  get column() {
    return this._column;
  }

  set column(column) {
    this._column = column;
  }

  get alias() {
    return this._alias;
  }

  set alias(alias) {
    this._alias = alias;
  }

  get tableName() {
    return this._table;
  }

  set tableName(table) {
    this._table = table;
  }

  get modelClass() {
    return this._modelClass;
  }

  set modelClass(modelClass) {
    this._modelClass = modelClass;
  }

  get isPlainColumnRef() {
    return (
      (!this._parsedExpr || this._parsedExpr.access.length === 0) && !this._cast && !this._toJson
    );
  }

  get expression() {
    return this._expr;
  }

  get cast() {
    return this._cast;
  }

  fullColumn(builder) {
    const table = this.tableName
      ? this.tableName
      : this.modelClass
        ? builder.tableRefFor(this.modelClass)
        : null;

    if (table) {
      return `${table}.${this.column}`;
    } else {
      return this.column;
    }
  }

  castText() {
    return this.castTo('text');
  }

  castInt() {
    return this.castTo('integer');
  }

  castBigInt() {
    return this.castTo('bigint');
  }

  castFloat() {
    return this.castTo('float');
  }

  castDecimal() {
    return this.castTo('decimal');
  }

  castReal() {
    return this.castTo('real');
  }

  castBool() {
    return this.castTo('boolean');
  }

  castJson() {
    this._toJson = true;
    return this;
  }

  castTo(sqlType) {
    this._cast = sqlType;
    return this;
  }

  from(table) {
    this._table = table;
    return this;
  }

  table(table) {
    this._table = table;
    return this;
  }

  model(modelClass) {
    this._modelClass = modelClass;
    return this;
  }

  as(alias) {
    this._alias = alias;
    return this;
  }

  clone() {
    const clone = new this.constructor(null);

    clone._expr = this._expr;
    clone._parsedExpr = this._parsedExpr;
    clone._column = this._column;
    clone._table = this._table;
    clone._cast = this._cast;
    clone._toJson = this._toJson;
    clone._alias = this._alias;
    clone._modelClass = this._modelClass;

    return clone;
  }

  toKnexRaw(builder) {
    return builder.knex().raw(...this._createRawArgs(builder));
  }

  _parseExpression(expr) {
    this._parsedExpr = parseFieldExpression(expr);
    this._column = this._parsedExpr.column;
    this._table = this._parsedExpr.table;
  }

  _createRawArgs(builder) {
    const dialect = getJsonDialect(builder.knex());
    const { access } = this._parsedExpr;
    const bindings = [this.fullColumn(builder)];
    let sql = '??';

    if (access.length > 0 || this._toJson) {
      dialect.checkSupport();
    }

    if (access.length > 0) {
      sql = dialect.extract(sql, access, this._cast);
    } else if (this._cast) {
      sql = dialect.cast(sql, this._cast);
    }

    if (this._toJson) {
      sql = dialect.toJson(sql, access.length === 0 && !this._cast);
    }

    sql = this._maybeAlias(sql, bindings);
    return [sql, bindings];
  }

  _maybeAlias(sql, bindings) {
    if (this._shouldAlias()) {
      bindings.push(this._alias);
      return `${sql} as ??`;
    } else {
      return sql;
    }
  }

  _shouldAlias() {
    if (!this._alias) {
      return false;
    } else if (!this.isPlainColumnRef) {
      return true;
    } else {
      // No need to alias if we are dealing with a simple column reference
      // and the alias is the same as the column name.
      return this._alias !== this._column;
    }
  }
}

Object.defineProperties(ReferenceBuilder.prototype, {
  isObjectionReferenceBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

export const ref = (reference) => {
  if (isObject(reference) && reference.isObjectionReferenceBuilder) {
    return reference;
  } else {
    return new ReferenceBuilder(reference);
  }
};
