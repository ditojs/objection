import { RawBuilder, normalizeRawArgs } from './RawBuilder.js';
import { asSingle, isNumber } from '../utils/objectUtils.js';

export class FunctionBuilder extends RawBuilder {}

export function fn(...argsIn) {
  const { sql, args } = normalizeRawArgs(argsIn);
  return new FunctionBuilder(`${sql}(${args.map(() => '?').join(', ')})`, args);
}

for (const func of ['coalesce', 'concat', 'sum', 'avg', 'min', 'max', 'count', 'upper', 'lower']) {
  fn[func] = (...args) => fn(func.toUpperCase(), args);
}

fn.now = (precision) => {
  precision = parseInt(asSingle(precision), 10);

  if (isNaN(precision) || !isNumber(precision)) {
    precision = 6;
  }

  // We need to use a literal precision instead of a binding here
  // for the CURRENT_TIMESTAMP to work. This is okay here since we
  // make sure `precision` is a number. There's no chance of SQL
  // injection here.
  return new FunctionBuilder(`CURRENT_TIMESTAMP(${precision})`, []);
};
