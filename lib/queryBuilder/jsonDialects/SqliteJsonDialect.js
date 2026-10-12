import { JsonDialect } from './JsonDialect.js';
import { toJsonPath } from '../../utils/parseFieldExpression.js';

export class SqliteJsonDialect extends JsonDialect {
  // `json_extract()` returns SQL values, which compare and sort like json
  // values, unlike the json text that `->` returns.
  extract(sql, access) {
    return `json_extract(${sql}, ${toSqliteJsonPathLiteral(access)})`;
  }

  // `json_quote()` keeps the values of json functions as json, but SQLite can't
  // tell json columns from text columns, which it would quote:
  toJson(sql, isColumn) {
    if (isColumn) {
      throw new Error(
        "ref().castJson() needs a json path or a cast on SQLite, which can't tell json columns " +
          'from text columns.',
      );
    }
    return `json_quote(${sql})`;
  }

  set(sql, access, value) {
    return `json_set(${sql}, ${toSqliteJsonPathLiteral(access)}, ${value})`;
  }

  superset() {
    throw new Error(
      'whereJsonSupersetOf() and whereJsonSubsetOf() are not supported on SQLite, which has no ' +
        'json containment.',
    );
  }

  isType(sql, access, type) {
    return `json_type(${sql}, ${toSqliteJsonPathLiteral(access)}) = '${type}'`;
  }

  // Like the `?|` operator of Postgres, find the keys of objects, the strings in
  // arrays and strings. The keys of objects are text, those of arrays integers:
  hasAnyKey(column, access, keys) {
    return [
      `exists (select 1 from json_each(??, ${toSqliteJsonPathLiteral(access)}) ` +
        "where case when typeof(json_each.key) = 'text' then json_each.key " +
        `when json_each.type = 'text' then json_each.value end in (${keys.map(() => '?').join(', ')}))`,
      [column, ...keys],
    ];
  }

  // SQLite accepts any type name, but not as json:
  // @override
  cast(sql, type) {
    return type === 'jsonb' ? this.json(sql) : super.cast(sql, type);
  }

  // @override
  json(sql) {
    return `json(${sql})`;
  }
}

// Formats the json path of a parsed field expression as a string literal, e.g.
// `'$."a"[0]'`. Like in `toPostgresJsonPathLiteral()`, the path can't be a
// binding, and knex reads every `?` in it as a binding placeholder. SQLite
// understands json escapes in quoted keys, so `?` is written as `\u003f`.
function toSqliteJsonPathLiteral(access) {
  return `'${toJsonPath(access).replace(/\?/g, '\\u003f').replace(/'/g, "''")}'`;
}
