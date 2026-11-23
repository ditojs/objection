import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { GraphUpsert } from '../graph/GraphUpsert.js';
import { RelationFindOperation } from '../../relations/RelationFindOperation.js';
import { InstanceFindOperation } from './InstanceFindOperation.js';
import { FindByIdOperation } from './FindByIdOperation.js';
import { FindByIdsOperation } from './FindByIdsOperation.js';

export class UpsertGraphOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(
      name,
      Object.assign({}, opt, {
        upsertOptions: {},
      }),
    );

    this.upsertOptions = opt.upsertOptions || {};
    this.upsert = null;
  }

  get models() {
    return this.upsert.objects;
  }

  get isArray() {
    return this.upsert.isArray;
  }

  onAdd(builder, args) {
    const [objects] = args;

    this.upsert = new GraphUpsert({
      objects,
      rootModelClass: builder.modelClass(),
      upsertOptions: this.upsertOptions,
    });

    // Never execute this builder.
    builder.resolve([]);

    return true;
  }

  isAtomic() {
    return this.upsert.graphOptions.isStrict();
  }

  onBefore1(builder, result) {
    GraphUpsert.checkForOnConflict(builder, this.name);

    // Checked before the query is built, as `onBuild()` hooks may add where
    // clauses to all queries, e.g. to leave out soft-deleted rows (#563):
    if (hasOtherSqlModifyingQueryBuilderCalls(builder)) {
      throw new Error(
        'upsertGraph query should contain no other query builder calls like `findById`, `where`, `$query` or `$relatedQuery` that would affect the SQL. They have no effect.',
      );
    }

    return result;
  }

  onAfter1(builder) {
    return this.upsert.run(builder);
  }

  clone() {
    const clone = super.clone();
    clone.upsert = this.upsert;
    return clone;
  }
}

// The operations of `findById()`, `findByIds()`, `$query()` and
// `$relatedQuery()` only add their where clauses when the query is built.
function hasOtherSqlModifyingQueryBuilderCalls(builder) {
  return builder.has(
    (op) =>
      /where/.test(op.name) ||
      op instanceof FindByIdOperation ||
      op instanceof FindByIdsOperation ||
      op instanceof InstanceFindOperation ||
      op instanceof RelationFindOperation,
  );
}
