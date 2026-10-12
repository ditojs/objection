import { JsonDialect } from './JsonDialect.js';
import { toPostgresJsonPathLiteral } from '../../utils/parseFieldExpression.js';

export class PostgresJsonDialect extends JsonDialect {
  // Casts need the value as text, e.g. `CAST('"a"'::jsonb AS text)` would keep
  // the quotes.
  extract(sql, access, cast) {
    return `${sql}${cast ? '#>>' : '#>'}${toPostgresJsonPathLiteral(access)}`;
  }

  toJson(sql) {
    return `to_jsonb(${sql})`;
  }

  set(sql, access, value) {
    return `jsonb_set(${sql}, ${toPostgresJsonPathLiteral(access)}, ${value}, true)`;
  }
}
