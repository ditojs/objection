import { DeleteOperation } from '../queryBuilder/operations/DeleteOperation.js';
import { RelationFindOperation } from './RelationFindOperation.js';

class RelationDeleteOperation extends DeleteOperation {
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

export { RelationDeleteOperation };
