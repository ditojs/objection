import { DelegateOperation } from './DelegateOperation.js';
import { FindByIdOperation } from './FindByIdOperation.js';
import { UpdateOperation } from './UpdateOperation.js';

export class UpdateAndFetchOperation extends DelegateOperation {
  constructor(name, opt) {
    super(name, opt);

    if (!this.delegate.is(UpdateOperation)) {
      throw new Error('Invalid delegate');
    }

    this.id = null;
    this.skipIdWhere = false;
    this.selectOperations = null;
    // Shared with the clones that each execution runs:
    this.state = { isMerged: false };
  }

  get model() {
    return this.delegate.model;
  }

  onAdd(builder, args) {
    this.id = args[0];
    return this.delegate.onAdd(builder, args.slice(1));
  }

  onBefore1(builder, result) {
    // A second run would write back the row that the first one merged into the
    // patch:
    if (this.state.isMerged) {
      throw new Error(
        `Unable to execute ${this.name}() twice, as the fetched row was merged into ` +
          'its patch. Create a new query for each run.',
      );
    }

    return super.onBefore1(builder, result);
  }

  onBefore3(builder, result) {
    // Selects have no effect on the update query, so remember them here to
    // apply them to the fetch query. Collect them before the query is built,
    // so that selects added by `onBuild` hooks in the shared context aren't
    // copied, as those hooks run again for the fetch query.
    this.selectOperations = new Set();
    builder.forEachOperation(builder.constructor.SelectSelector, (op) => {
      this.selectOperations.add(op);
    });

    return super.onBefore3(builder, result);
  }

  onBuild(builder) {
    if (!this.skipIdWhere) {
      builder.findById(this.id);
    }

    super.onBuild(builder);
  }

  async onAfter2(builder, numUpdated) {
    if (numUpdated == 0 && !this.delegate.hasNothingToUpdate) {
      // If nothing was updated, we should fetch nothing.
      await super.onAfter2(builder, numUpdated);
      return undefined;
    }

    // An empty update writes nothing, so fetch the row only if it matches the
    // filters of the update:
    const fetchQuery = this.delegate.hasNothingToUpdate
      ? builder.toFindQuery().first()
      : builder
          .emptyInstance()
          .childQueryOf(builder)
          .copyFrom(builder, (op) => !!this.selectOperations?.has(op))
          .modify((builder) => {
            if (!this.skipIdWhere) {
              builder.findById(this.id);
            }
          });
    const fetched = await fetchQuery.castTo(builder.resultModelClass());

    if (fetched) {
      if (!fetched.$isObjectionModel) {
        throw new Error(
          `Unable to merge the result of ${builder.modelClass().name}.afterFind() in ` +
            `${this.name}(): expected a model.`,
        );
      }

      this.model.$set(fetched);
      this.state.isMerged = true;
      // A custom `select` may not include the id. The row was fetched by
      // id, so make sure the result still has it.
      if (!this.model.$hasId()) {
        this.model.$id(this.id);
      }
    }

    await super.onAfter2(builder, numUpdated);
    return fetched ? this.model : undefined;
  }

  toFindOperation(builder) {
    // The find operation of the delegate keeps its filters, e.g. the ones that
    // many-to-many updates move to a subquery when the query is built.
    const delegate = this.delegate.toFindOperation(builder);

    return delegate
      ? new FindByIdDelegateOperation('find', { delegate, id: this.id })
      : new FindByIdOperation('findById', { id: this.id });
  }

  clone() {
    const clone = super.clone();

    clone.id = this.id;
    clone.skipIdWhere = this.skipIdWhere;
    clone.state = this.state;

    return clone;
  }
}

// Finds the rows of a delegate find operation by id, like `UpdateAndFetchOperation`
// updates them.
class FindByIdDelegateOperation extends DelegateOperation {
  onBuild(builder) {
    super.onBuild(builder);
    builder.findById(this.opt.id);
  }
}
