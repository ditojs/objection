import { asArray, isObject } from '../utils/objectUtils.js';
import { AsArrayOperation } from './operations/AsArrayOperation.js';

const BUILDER_SYMBOL = Symbol();

export class StaticHookArguments {
  constructor({ builder, result }) {
    // The builder should never be accessed through the arguments.
    // Hide it as well as possible to discourage people from
    // digging it out.
    Object.defineProperty(this, BUILDER_SYMBOL, {
      value: builder,
    });

    Object.defineProperty(this, 'result', {
      value: result,
    });
  }

  static create(args) {
    return new StaticHookArguments(args);
  }

  get asFindQuery() {
    return () => {
      // The query resolves to an array also for single-result writes, unless
      // the hook adds `first()`:
      return this[BUILDER_SYMBOL].toFindQuery().addOperation(new AsArrayOperation('asArray'), []);
    };
  }

  get context() {
    return this[BUILDER_SYMBOL].context();
  }

  get transaction() {
    return this[BUILDER_SYMBOL].unsafeKnex();
  }

  get relation() {
    const op = findRelationOperation(this[BUILDER_SYMBOL], hasRelation);

    if (op) {
      return getRelation(op);
    } else {
      return undefined;
    }
  }

  get modelOptions() {
    const op = this[BUILDER_SYMBOL].findOperation(hasModelOptions);

    if (op) {
      return getModelOptions(op);
    } else {
      return undefined;
    }
  }

  get items() {
    const op = findRelationOperation(this[BUILDER_SYMBOL], hasItems);

    if (op) {
      return asArray(getItems(op));
    } else {
      return [];
    }
  }

  get inputItems() {
    const op = this[BUILDER_SYMBOL].findOperation(hasInputItems);

    if (op) {
      return asArray(getInputItems(op));
    } else {
      return [];
    }
  }

  get cancelQuery() {
    const args = this;

    return (cancelValue) => {
      const builder = this[BUILDER_SYMBOL];

      if (cancelValue === undefined) {
        if (builder.isInsert()) {
          cancelValue = args.inputItems;
        } else if (builder.isFind()) {
          cancelValue = [];
        } else {
          cancelValue = 0;
        }
      } else if (builder.isInsert() && isObject(cancelValue)) {
        // A single row is merged into the input model, like an array of rows.
        cancelValue = asArray(cancelValue);
      }

      builder.resolve(cancelValue);
    };
  }
}

// The outer queries of `insertGraph()` and `upsertGraph()` call no static hooks,
// the queries that they run for the graph do. Match their operations by name,
// as importing them here would create an import cycle.
export function isGraphQuery(builder) {
  return builder.has(/^(insertGraph|upsertGraph)/);
}

// The relations that `withGraphJoined()` fetches have no query of their own, so
// the hooks of their model classes get the relation and its owners instead.
export class JoinedStaticHookArguments extends StaticHookArguments {
  #relation;
  #items;

  constructor({ builder, result, relation, items }) {
    super({ builder, result });
    this.#relation = relation;
    this.#items = items;
  }

  static create(args) {
    return new JoinedStaticHookArguments(args);
  }

  get asFindQuery() {
    return () => {
      throw new Error(
        'asFindQuery() is not available for relations fetched with withGraphJoined().',
      );
    };
  }

  get relation() {
    return this.#relation;
  }

  get modelOptions() {
    return undefined;
  }

  get items() {
    return this.#items;
  }

  get inputItems() {
    return [];
  }

  get cancelQuery() {
    return () => {
      throw new Error(
        'cancelQuery() is not available for relations fetched with withGraphJoined().',
      );
    };
  }
}

// The queries that `relate()` and `unrelate()` run in their place get the
// relation and the owners of the relate or unrelate query.
function findRelationOperation(builder, predicate) {
  const parent = builder.parentQuery();
  return (
    builder.findOperation(predicate) ||
    (parent?.isRelate() || parent?.isUnrelate() ? parent.findOperation(predicate) : null)
  );
}

function getRelation(op) {
  return op.relation;
}

function hasRelation(op) {
  return !!getRelation(op);
}

function getModelOptions(op) {
  return op.modelOptions;
}

function hasModelOptions(op) {
  return !!getModelOptions(op);
}

function getItems(op) {
  return op.instance || (op.owner && op.owner.isModels && op.owner.modelArray);
}

function hasItems(op) {
  return !!getItems(op);
}

function getInputItems(op) {
  return op.models || op.model;
}

function hasInputItems(op) {
  return !!getInputItems(op);
}
