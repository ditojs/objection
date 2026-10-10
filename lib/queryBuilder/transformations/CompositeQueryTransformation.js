import { QueryTransformation } from './QueryTransformation.js';

class CompositeQueryTransformation extends QueryTransformation {
  constructor(transformations) {
    super();
    this.transformations = transformations;
  }

  onConvertQueryBuilderBase(item, builder) {
    for (const transformation of this.transformations) {
      item = transformation.onConvertQueryBuilderBase(item, builder);
    }

    return item;
  }
}

export { CompositeQueryTransformation };
