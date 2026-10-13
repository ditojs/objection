import { RelationFindOperation } from '../../RelationFindOperation.js';
import { getTempColumn } from '../../../utils/tmpColumnUtils.js';

export class ManyToManyFindOperation extends RelationFindOperation {
  constructor(name, opt) {
    super(name, opt);

    this.ownerJoinColumnAlias = new Array(this.relation.joinTableOwnerProp.size);

    for (let i = 0, l = this.ownerJoinColumnAlias.length; i < l; ++i) {
      this.ownerJoinColumnAlias[i] = getTempColumn(i);
    }
  }

  onBuild(builder) {
    const relatedModelClass = this.relation.relatedModelClass;

    this.maybeApplyAlias(builder);
    this.relation.findQuery(builder, this.owner);

    if (!builder.hasSelects()) {
      const table = builder.tableRefFor(relatedModelClass);

      // If the user hasn't specified a select clause, select the related model's columns.
      // If we don't do this we also get the join table's columns.
      builder.select(`${table}.*`);

      // Also select all extra columns.
      for (const extra of this.relation.joinTableExtras) {
        const joinTable = this.relation.joinTableAliasFor(builder);
        builder.select(`${joinTable}.${extra.joinTableCol} as ${extra.aliasCol}`);
      }
    }

    if (this.owner.isModels) {
      this.checkOwnerProps();

      if (this.assignResultToOwner) {
        this.selectMissingJoinColumns(builder);
      }
    }
  }

  // @override
  getOwnerKey(related) {
    return related.$propKey(this.ownerJoinColumnAlias);
  }

  // @override
  ownerKeys() {
    return this.ownerJoinColumnAlias;
  }

  // The related models are assigned to their owners by the owner join columns
  // selected from the join table. They can get lost, e.g. in a custom
  // `$parseDatabaseJson()` (#2258).
  // @override
  checkRelatedProps(related) {
    const { name, ownerModelClass, joinTableOwnerProp } = this.relation;

    for (let c = 0, lc = this.ownerJoinColumnAlias.length; c < lc; ++c) {
      const alias = this.ownerJoinColumnAlias[c];

      if (related.some((rel) => rel[alias] === undefined)) {
        throw new Error(
          `Unable to fetch relation "${name}" of ${ownerModelClass.name}: some related models ` +
            `are missing the join table column "${joinTableOwnerProp.propDescription(c)}" ` +
            `selected as "${alias}". Check that $parseDatabaseJson() and the column name ` +
            'mappers of the related model keep it.',
        );
      }
    }
  }

  clone() {
    const clone = super.clone();
    clone.ownerJoinColumnAlias = this.ownerJoinColumnAlias.slice();
    return clone;
  }

  selectMissingJoinColumns(builder) {
    const { relatedModelClass, joinTableOwnerProp } = this.relation;

    // We must select the owner join columns so that we know for which owner model the related
    // models belong to after the requests.
    joinTableOwnerProp.forEach((i) => {
      const joinTableOwnerRef = joinTableOwnerProp
        .ref(builder, i)
        .table(this.relation.joinTableAliasFor(builder));
      const propName = relatedModelClass.columnNameToPropertyName(this.ownerJoinColumnAlias[i]);

      builder.select(joinTableOwnerRef.as(this.ownerJoinColumnAlias[i]));
      // Unlike the join props, these aliases are never kept, as they aren't
      // props of the related model.
      builder.addInternalSelection(propName);
    });

    super.selectMissingJoinColumns(builder);
  }
}
