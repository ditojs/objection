// Renders the SQL of json field expressions like `ref('column:a.b')`, their
// casts and the json values of `val()` for one database. The json methods are
// implemented by the subclasses of the databases that support them.
export class JsonDialect {
  // Throw or warn for databases that can't render json field expressions.
  // @overridable
  checkSupport() {}

  // @overridable
  cast(sql, type) {
    return `CAST(${sql} AS ${type})`;
  }

  // Turn the json text of a binding into a json value.
  // @overridable
  json(sql) {
    return sql;
  }
}
