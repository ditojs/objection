export class InternalOptions {
  constructor() {
    this.keepImplicitJoinProps = false;
    this.returnImmediatelyValue = undefined;
    this.isInternalQuery = false;
    this.skipRelationFilter = false;
    // The join table extras that related updates write, all of them if null:
    this.joinTableExtras = null;
    // The field expressions that `upsertGraph()` writes keys in json columns of
    // updated rows with:
    this.fieldExpressionKeys = [];
    this.debug = false;
    this.schema = undefined;
  }

  clone() {
    const copy = new this.constructor();

    copy.keepImplicitJoinProps = this.keepImplicitJoinProps;
    copy.returnImmediatelyValue = this.returnImmediatelyValue;
    copy.isInternalQuery = this.isInternalQuery;
    copy.skipRelationFilter = this.skipRelationFilter;
    copy.joinTableExtras = this.joinTableExtras;
    copy.fieldExpressionKeys = this.fieldExpressionKeys;
    copy.debug = this.debug;
    copy.schema = this.schema;

    return copy;
  }
}
