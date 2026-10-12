import { WhereJsonOperation } from './WhereJsonOperation.js';
import { parseFieldExpression } from '../../../utils/parseFieldExpression.js';

// `whereJsonIsArray()`, `whereJsonNotArray()`, `whereJsonIsObject()`,
// `whereJsonNotObject()` and their variants.
export class WhereJsonTypeOperation extends WhereJsonOperation {
  // @override
  buildWhere(dialect, [fieldExpression]) {
    const { columnName, access } = parseFieldExpression(fieldExpression);
    const sql = dialect.isType('??', access, this.opt.type);
    // Missing values and json `null` are neither arrays nor objects:
    return [this.opt.not ? `not coalesce(${sql}, false)` : sql, [columnName]];
  }
}
