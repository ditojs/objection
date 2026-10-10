import { isPlainObject } from '../utils/objectUtils.js';
import { buildArg } from '../utils/buildUtils.js';

export class RawBuilder {
  constructor(sql, args) {
    this._sql = `${sql}`;
    this._args = args;
    this._as = null;
  }

  get alias() {
    return this._as;
  }

  as(as) {
    this._as = as;
    return this;
  }

  toKnexRaw(builder) {
    let args = null;
    let sql = this._sql;

    if (this._args.length === 1 && isPlainObject(this._args[0])) {
      args = buildObject(this._args[0], builder);

      if (this._as) {
        args.__alias__ = this._as;
        sql += ' as :__alias__:';
      }
    } else {
      args = buildArray(this._args, builder);

      if (this._as) {
        args.push(this._as);
        sql += ' as ??';
      }
    }

    return builder.knex().raw(sql, args);
  }
}

Object.defineProperties(RawBuilder.prototype, {
  isObjectionRawBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

function buildArray(arr, builder) {
  return arr.map((it) => buildArg(it, builder));
}

function buildObject(obj, builder) {
  return Object.keys(obj).reduce((args, key) => {
    args[key] = buildArg(obj[key], builder);
    return args;
  }, {});
}

export function normalizeRawArgs(argsIn) {
  const [sql, ...restArgs] = argsIn;

  if (restArgs.length === 1 && Array.isArray(restArgs[0])) {
    return {
      sql,
      args: restArgs[0],
    };
  } else {
    return {
      sql,
      args: restArgs,
    };
  }
}

export function raw(...argsIn) {
  const { sql, args } = normalizeRawArgs(argsIn);
  return new RawBuilder(sql, args);
}
