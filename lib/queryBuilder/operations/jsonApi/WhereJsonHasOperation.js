import { WhereJsonOperation } from './WhereJsonOperation.js';
import { parseFieldExpression } from '../../../utils/parseFieldExpression.js';
import { asArray, isString } from '../../../utils/objectUtils.js';

// `whereJsonHasAny()`, `whereJsonHasAll()` and their variants.
export class WhereJsonHasOperation extends WhereJsonOperation {
  // @override
  buildWhere(dialect, [fieldExpression, keys]) {
    const { columnName, access } = parseFieldExpression(fieldExpression);
    keys = asArray(keys);

    if (keys.length === 0) {
      throw new Error('At least one key to find is required.');
    } else if (!keys.every(isString)) {
      throw new Error('All keys to find must be strings.');
    }

    return dialect.hasKeys(columnName, access, keys, this.opt.all);
  }
}
