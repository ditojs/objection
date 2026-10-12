import { UpdateOperation } from '../queryBuilder/operations/UpdateOperation.js';

export class RelationUpdateOperation extends UpdateOperation {
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
