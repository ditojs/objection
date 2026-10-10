import { UnrelateOperation } from '../../../queryBuilder/operations/UnrelateOperation.js';
import { addWhereGroup } from '../../../queryBuilder/whereGroups.js';

class ManyToManyUnrelateOperationBase extends UnrelateOperation {
  queryExecutor(builder) {
    const unrelateQuery = this.relation
      .getJoinModelClass(builder.knex())
      .query()
      .childQueryOf(builder)
      .delete();

    addWhereGroup(unrelateQuery, () => this.applyModifyFilterForJoinTable(unrelateQuery));
    addWhereGroup(unrelateQuery, () => unrelateQuery.modify(this.relation.joinTableModify));

    return unrelateQuery;
  }

  /* istanbul ignore next */
  applyModifyFilterForRelatedTable(builder) {
    throw new Error('not implemented');
  }

  /* istanbul ignore next */
  applyModifyFilterForJoinTable(builder) {
    throw new Error('not implemented');
  }
}

export { ManyToManyUnrelateOperationBase };
