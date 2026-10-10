import { UpdateOperation } from '../queryBuilder/operations/UpdateOperation.js';
import { RelationFindOperation } from './RelationFindOperation.js';

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

  toFindOperation() {
    return new RelationFindOperation('find', {
      relation: this.relation,
      owner: this.owner,
    });
  }
}
