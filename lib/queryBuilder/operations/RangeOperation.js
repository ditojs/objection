import { RunAfterOperation } from './RunAfterOperation.js';

// Wraps the result in `{ results, total }` as a `runAfter` callback.
export class RangeOperation extends RunAfterOperation {
  onAdd(builder, args) {
    if (args.length === 2) {
      const start = args[0];
      const end = args[1];

      // Need to set these here instead of `onBuildKnex` so that they
      // don't end up in the resultSize query.
      builder.limit(end - start + 1).offset(start);
    }

    return true;
  }

  onBefore1(builder, result) {
    const resultSizeBuilder = builder.clone();

    this.func = async (results) => {
      const resultSize = await resultSizeBuilder.resultSize();

      return {
        results,
        total: parseInt(resultSize),
      };
    };

    return super.onBefore1(builder, result);
  }
}
