import { InsertOperation } from './InsertOperation.js';
import { DelegateOperation } from './DelegateOperation.js';
import { keyByProps } from '../../model/modelUtils.js';
import { asArray } from '../../utils/objectUtils.js';

export class InsertAndFetchOperation extends DelegateOperation {
  constructor(name, opt) {
    super(name, opt);

    if (!this.delegate.is(InsertOperation)) {
      throw new Error('Invalid delegate');
    }
  }

  get models() {
    return this.delegate.models;
  }

  async onAfter2(builder, inserted) {
    const modelClass = builder.modelClass();
    const insertedModels = await super.onAfter2(builder, inserted);

    // Models without identifiers can't be fetched. This happens when a row
    // with a database generated identifier is ignored by `onConflict()`.
    const insertedModelArray = asArray(insertedModels).filter((model) => model && model.$hasId());
    const idProps = modelClass.getIdPropertyArray();
    const ids = insertedModelArray.map((model) => model.$id());

    if (ids.length === 0) {
      return insertedModels;
    }

    const fetchedModels = await modelClass
      .query()
      .childQueryOf(builder)
      .findByIds(ids)
      .castTo(builder.resultModelClass());

    const modelsById = keyByProps(fetchedModels, idProps);

    // Instead of returning the freshly fetched models, update the input
    // models with the fresh values.
    insertedModelArray.forEach((insertedModel) => {
      insertedModel.$set(modelsById.get(insertedModel.$propKey(idProps)));
    });

    return insertedModels;
  }
}
