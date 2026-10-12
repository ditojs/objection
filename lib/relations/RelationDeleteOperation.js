import { DeleteOperation } from '../queryBuilder/operations/DeleteOperation.js';

export class RelationDeleteOperation extends DeleteOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
  }

  onBuild(builder) {
    super.onBuild(builder);
    this.relation.findQuery(builder, this.owner);
  }

  toFindOperation(builder) {
    return this.relation.find(builder, this.owner);
  }
}
