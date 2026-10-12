import { JsonDialect } from './JsonDialect.js';
import { toJsonPath } from '../../utils/parseFieldExpression.js';

// MySQL can only cast to these types, see `CAST()` in its manual. `float` is a
// double precision number in Postgres, `real` a single precision one, and the
// precision of `decimal` is the maximum, as MySQL's default rounds to integers.
const castTypes = {
  text: 'CHAR',
  integer: 'SIGNED',
  bigint: 'SIGNED',
  boolean: 'SIGNED',
  float: 'DOUBLE',
  real: 'FLOAT',
  decimal: 'DECIMAL(65,30)',
  jsonb: 'JSON',
};

export class MySqlJsonDialect extends JsonDialect {
  // Casting json values works for all types but text, where json strings need
  // to be unquoted. Json null is cast to 0 or 'null', so turn it into NULL like
  // Postgres and SQLite do.
  extract(sql, access, cast) {
    const value = `JSON_EXTRACT(${sql}, ${toMySqlJsonPathLiteral(access)})`;
    if (cast) {
      const nullable = `NULLIF(${value}, CAST('null' AS JSON))`;
      return /^char\b/i.test(castTypes[cast] || cast) ? `JSON_UNQUOTE(${nullable})` : nullable;
    } else {
      return value;
    }
  }

  // Like `to_jsonb()`, turn SQL values into json and keep json values as they are:
  toJson(sql) {
    return `JSON_EXTRACT(JSON_ARRAY(${sql}), '$[0]')`;
  }

  set(sql, access, value) {
    return `JSON_SET(${sql}, ${toMySqlJsonPathLiteral(access)}, ${value})`;
  }

  // @override
  cast(sql, type) {
    return super.cast(sql, castTypes[type] || type);
  }

  // @override
  json(sql) {
    return `CAST(${sql} AS JSON)`;
  }
}

// Formats the json path of a parsed field expression as a string literal, e.g.
// `'$."a"[0]'`. Like in `toPostgresJsonPathLiteral()`, the path can't be a
// binding. Paths with `?` or backslashes are written as hex literals: the mysql
// driver reads every `?` as a binding placeholder, and whether backslashes
// escape in string literals depends on the `NO_BACKSLASH_ESCAPES` SQL mode.
function toMySqlJsonPathLiteral(access) {
  const path = toJsonPath(access);
  return /[?\\]/.test(path)
    ? `_utf8mb4 X'${Buffer.from(path).toString('hex')}'`
    : `'${path.replace(/'/g, "''")}'`;
}
