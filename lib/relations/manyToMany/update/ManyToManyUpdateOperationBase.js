import { UpdateOperation } from '../../../queryBuilder/operations/UpdateOperation.js';
import { addWhereGroup } from '../../../queryBuilder/whereGroups.js';
import { chunk } from '../../../utils/objectUtils.js';
import { isMySql, isMsSql } from '../../../utils/knexUtils.js';

// Stay below the limits of bound values per statement of SQLite before 3.32
// (999) and SQL Server (2100), leaving room for the patched values:
const maxBatchValues = 500;

const LimitSelector = /^(orderBy\w*|limit|offset)$/;

export class ManyToManyUpdateOperationBase extends UpdateOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;

    this.hasExtraProps = false;
    this.relatedIdsQuery = null;
    this.relatedIds = null;
    this.joinTablePatch = {};
    this.joinTablePatchFilterQuery = null;
  }

  get modifiesJoinTable() {
    return this.hasExtraProps;
  }

  onAdd(builder, args) {
    const obj = args[0];

    // The modified rows are known to be related to the owner, so they are
    // filtered by their own ids instead of a subquery that joins the join
    // table. On MySQL, concurrent updates with that subquery deadlock (#135).
    this.skipRelationFilter = builder.internalOptions().skipRelationFilter;

    // Copy all extra properties to the `joinTablePatch` object.
    for (const extra of this.relation.joinTableExtras) {
      if (extra.aliasProp in obj) {
        this.hasExtraProps = true;
        this.joinTablePatch[extra.joinTableProp] = obj[extra.aliasProp];
      }
    }

    if (this.hasExtraProps) {
      this.relation.assertCanModifyJoinTable(builder, `${this.name} with extra properties`);
    }

    const res = super.onAdd(builder, args);

    if (this.hasExtraProps) {
      // Make sure we don't try to insert the extra properties
      // to the target table.
      this.relation.omitExtraProps([this.model]);
    }

    return res;
  }

  onBuild(builder) {
    if (this.modifiesJoinTable && this.modifyFilterSubquery) {
      // MySQL and SQL Server are the only databases that support a limit in
      // updates. As the related rows are updated by their ids, the limit and
      // the order pick these ids instead of limiting each batch of them.
      // Without a limit or an offset, the order picks nothing and the query
      // stays as it is.
      const knex = builder.knex();
      const hasLimit = (isMySql(knex) || isMsSql(knex)) && builder.has(/^(limit|offset)$/);

      // The related rows to update are identified by their ids first, see
      // `onAfterBuild()`.
      this.relatedIdsQuery = this.createRelatedIdsQuery(builder, hasLimit);
      if (hasLimit) {
        this.relatedIdsQuery.copyFrom(builder, LimitSelector);
        builder.clear(LimitSelector);
      }
    }

    return super.onBuild(builder);
  }

  // Selects the ids of the related rows to update. Fetch raw rows, so that no
  // hooks run for them.
  createRelatedIdsQuery(builder, hasLimit) {
    const { relatedModelClass } = this.relation;

    if (hasLimit) {
      // The limit picks related rows, not join rows, so filter the related
      // table by the ids of the matching join rows:
      const relatedIdsQuery = relatedModelClass.query().childQueryOf(builder);
      const idRefs = relatedModelClass.getIdRelationProperty().refs(relatedIdsQuery);
      return this.applyModifyFilterForRelatedTable(relatedIdsQuery).select(idRefs);
    } else {
      // Select the ids from the filter subquery itself. Filtering the related
      // table by them again lets Postgres pick plans that run the subquery
      // once per related row, which takes minutes for a few thousand (#161).
      const relatedIdsQuery = this.modifyFilterSubquery.clone();
      const idRefs = relatedModelClass.getIdRelationProperty().refs(relatedIdsQuery);
      return relatedIdsQuery.distinct(idRefs);
    }
  }

  // Update the join rows before the related rows, while the filters still
  // match them (#161). A query resolved without updating anything, e.g. with
  // `none()`, leaves the join rows untouched too.
  async onAfterBuild(builder) {
    // An offset that `onBuild()` moved to the ids query is honoured, and
    // doesn't warn.
    super.onAfterBuild(builder);
    if (this.hasExtraProps && !this.isResolvedWithoutUpdate(builder)) {
      if (this.relatedIdsQuery) {
        // The filters can also reference the extras that the join rows change,
        // so identify the related rows to modify first.
        const rows = await this.relatedIdsQuery.toKnexQuery();
        this.relatedIds = rows.map((row) => Object.values(row));
      }

      let numJoinRowsUpdated;
      if (this.relatedIdsQuery?.has(/^(limit|offset)$/)) {
        // The filters match the join rows of more related rows than the limit
        // picks, so only update the join rows of the picked ones.
        for (const ids of this.relatedIdBatches()) {
          await this.updateJoinRows(builder, ids);
        }
      } else {
        numJoinRowsUpdated = await this.updateJoinRows(builder);
      }

      if (this.hasNothingToUpdate) {
        // Only the join rows change, so count the related rows that they
        // belong to, as the update of the related rows does. Without their
        // ids, the join rows all belong to the updated model, see
        // `applyIdFilterForJoinTable()`.
        builder.resolve(this.relatedIds?.length ?? Math.min(numJoinRowsUpdated, 1));
      }
    }
  }

  updateJoinRows(builder, relatedIds = null) {
    const joinTableUpdateQuery = this.relation
      .getJoinModelClass(builder.knex())
      .query()
      .childQueryOf(builder)
      .patch(this.joinTablePatch);

    addWhereGroup(joinTableUpdateQuery, () =>
      this.skipRelationFilter
        ? this.applyIdFilterForJoinTable(joinTableUpdateQuery)
        : this.applyModifyFilterForJoinTable(joinTableUpdateQuery),
    );
    if (relatedIds) {
      addWhereGroup(joinTableUpdateQuery, () =>
        joinTableUpdateQuery.whereInComposite(
          this.relation.joinTableRelatedProp.refs(joinTableUpdateQuery),
          relatedIds,
        ),
      );
    }
    addWhereGroup(joinTableUpdateQuery, () =>
      joinTableUpdateQuery.modify(this.relation.joinTableModify),
    );

    return joinTableUpdateQuery;
  }

  // Update the related rows in batches of their ids, as databases limit the
  // number of values in one statement.
  queryBatches(builder) {
    if (this.relatedIds) {
      const batches = this.relatedIdBatches();
      // Without ids, still execute the query once for the dialect's result:
      return batches.length > 0 ? batches : [[]];
    } else {
      return null;
    }
  }

  relatedIdBatches() {
    const idSize = this.relation.relatedModelClass.getIdRelationProperty().size;
    return chunk(this.relatedIds, Math.floor(maxBatchValues / idSize));
  }

  // Filters the join rows by the ids of the owner and the updated model.
  applyIdFilterForJoinTable(builder) {
    return builder
      .whereInComposite(
        this.relation.joinTableOwnerProp.refs(builder),
        this.owner.getProps(this.relation),
      )
      .whereComposite(
        this.relation.joinTableRelatedProp.refs(builder),
        this.relation.relatedProp.getProps(this.model),
      );
  }

  /* istanbul ignore next */
  applyModifyFilterForRelatedTable(builder) {
    throw new Error('not implemented');
  }

  /* istanbul ignore next */
  applyModifyFilterForJoinTable(builder) {
    throw new Error('not implemented');
  }

  clone() {
    const clone = super.clone();

    clone.hasExtraProps = this.hasExtraProps;
    clone.relatedIdsQuery = this.relatedIdsQuery;
    clone.relatedIds = this.relatedIds;
    clone.joinTablePatch = this.joinTablePatch;
    clone.joinTablePatchFilterQuery = this.joinTablePatchFilterQuery;

    return clone;
  }
}
