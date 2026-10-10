import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { GraphUpsert } from '../graph/GraphUpsert.js';
import { RelationFindOperation } from '../../relations/RelationFindOperation.js';

class UpsertGraphOperation extends QueryBuilderOperation {
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

  onBefore1(builder, result) {
    GraphUpsert.warnOnConflict(builder, this.name);
    return result;
  }

  onAfter1(builder) {
    if (hasOtherSqlModifyingQueryBuilderCalls(builder)) {
      throw new Error(
        'upsertGraph query should contain no other query builder calls like `findById`, `where` or `$relatedQuery` that would affect the SQL. They have no effect.',
      );
    }

    return this.upsert.run(builder);
  }

  clone() {
    const clone = super.clone();
    clone.upsert = this.upsert;
    return clone;
  }
}

function hasOtherSqlModifyingQueryBuilderCalls(builder) {
  return builder.has(/where/) || builder.has(RelationFindOperation);
}

export { UpsertGraphOperation };
