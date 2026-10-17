import { JsonDialect } from './JsonDialect.js';
import {
  toPostgresJsonPathLiteral,
  toPostgresStringLiteral,
} from '../../utils/parseFieldExpression.js';

export class PostgresJsonDialect extends JsonDialect {
  // Casts need the value as text, e.g. `CAST('"a"'::jsonb AS text)` would keep
  // the quotes. Single keys use `->` / `->>`, which expression indexes are
  // usually built on, unless they can be array indexes, which only `#>` / `#>>`
  // read from both arrays and objects.
  extract(sql, access, cast) {
    const key = String(access[0].ref);
    const value =
      access.length === 1 && !/^\s*[+-]?\d+$/.test(key)
        ? `${sql}${cast ? '->>' : '->'}${toPostgresStringLiteral(key)}`
        : `${sql}${cast ? '#>>' : '#>'}${toPostgresJsonPathLiteral(access)}`;
    return cast ? this.cast(value, cast) : value;
  }

  toJson(sql) {
    return `to_jsonb(${sql})`;
  }

  set(sql, access, value) {
    return `jsonb_set(${sql}, ${toPostgresJsonPathLiteral(access)}, ${value}, true)`;
  }

  // The json operators need jsonb, also for json columns:
  // @override
  jsonOperand(sql) {
    return `( ${sql} )::jsonb`;
  }

  superset([left, leftBindings], [right, rightBindings]) {
    return [`${left} @> ${right}`, [...leftBindings, ...rightBindings]];
  }

  // @override
  subset([left, leftBindings], [right, rightBindings]) {
    return [`${left} <@ ${right}`, [...leftBindings, ...rightBindings]];
  }

  isType(sql, access, type) {
    return `jsonb_typeof(${this.jsonOperand(this.field(sql, access))}) = '${type}'`;
  }

  // @override
  hasKeys(column, access, keys, all) {
    return [
      `${this.field('??', access)} ${all ? '\\?&' : '\\?|'} array[${keys.map(() => '?').join(',')}]`,
      [column, ...keys],
    ];
  }
}
