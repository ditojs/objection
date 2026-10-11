export class InternalOptions {
  constructor() {
    this.keepImplicitJoinProps = false;
    this.returnImmediatelyValue = undefined;
    this.isInternalQuery = false;
    this.skipRelationFilter = false;
    this.debug = false;
    this.schema = undefined;
  }

  clone() {
    const copy = new this.constructor();

    copy.keepImplicitJoinProps = this.keepImplicitJoinProps;
    copy.returnImmediatelyValue = this.returnImmediatelyValue;
    copy.isInternalQuery = this.isInternalQuery;
    copy.skipRelationFilter = this.skipRelationFilter;
    copy.debug = this.debug;
    copy.schema = this.schema;

    return copy;
  }
}
