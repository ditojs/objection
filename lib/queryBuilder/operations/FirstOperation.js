import { QueryBuilderOperation } from './QueryBuilderOperation.js';
import { LimitPerParentOperation } from './LimitPerParentOperation.js';

export class FirstOperation extends QueryBuilderOperation {
  shouldLimit(builder) {
    return builder.isFind() && builder.modelClass().useLimitInFirst;
  }

  onBuildKnex(knexBuilder, builder) {
    if (this.shouldLimit(builder)) {
      knexBuilder = knexBuilder.limit(1);
    }

    return knexBuilder;
  }

  onAfter3(builder, result) {
    // Limited per parent, the query still returns the models of all parents:
    if (Array.isArray(result) && !builder.has(LimitPerParentOperation)) {
      return result[0];
    } else {
      return result;
    }
  }
}
