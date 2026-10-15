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

  // The value that the path updates of a column start from, an empty one where
  // the column is NULL, as `set()` leaves NULL as it is.
  setBase(sql, access) {
    return `COALESCE(${sql}, '${access[0].type === 'array' ? '[]' : '{}'}')`;
  }

  // Reference the bare column if there is no path, so that the database can use
  // its indexes.
  field(sql, access) {
    return access.length > 0 ? this.extract(sql, access) : sql;
  }

  // Turn the operands of `superset()` and `subset()` into json values.
  // @overridable
  jsonOperand(sql) {
    return sql;
  }

  // The operands are pairs of SQL and bindings, so they can swap places:
  // @overridable
  subset(left, right) {
    return this.superset(right, left);
  }

  // Return the SQL and bindings, as the column may appear more than once.
  // @overridable
  hasKeys(column, access, keys, all) {
    if (all) {
      const parts = keys.map((key) => this.hasAnyKey(column, access, [key]));
      return [
        `(${parts.map(([sql]) => sql).join(' and ')})`,
        parts.flatMap(([, bindings]) => bindings),
      ];
    } else {
      return this.hasAnyKey(column, access, keys);
    }
  }
}
