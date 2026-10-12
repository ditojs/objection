import { FindOperation } from '../queryBuilder/operations/FindOperation.js';
import { RangeOperation } from '../queryBuilder/operations/RangeOperation.js';
import { asArray } from '../utils/objectUtils.js';
import { hasAliasSelection } from '../queryBuilder/operations/select/Selection.js';

export class RelationFindOperation extends FindOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.alwaysReturnArray = false;
    this.assignResultToOwner = true;
    this.relationProperty = opt.relationProperty || this.relation.name;
    this.alias = null;
    // Shared with the clones that execute the query, for `assignResult()`.
    this.ownerKeyByRelated = new Map();
  }

  onBuild(builder) {
    this.maybeApplyAlias(builder);
    this.relation.findQuery(builder, this.owner);

    if (this.owner.isModels) {
      this.checkOwnerProps();

      if (this.assignResultToOwner) {
        this.selectMissingJoinColumns(builder);
      }
    }
  }

  onAfter2(_, related) {
    if (this.assignResultToOwner && this.owner.isModels) {
      this.checkRelatedProps(related);
      // Read the owner keys before the join columns that were only selected
      // for them are omitted from the related models.
      for (const rel of related) {
        this.ownerKeyByRelated.set(rel, this.getOwnerKey(rel));
      }
    }

    return related;
  }

  onAfter3(builder, related) {
    const isOneToOne = this.relation.isOneToOne();

    if (!this.alwaysReturnArray && isOneToOne && related.length <= 1) {
      related = related[0] || undefined;
    }

    return super.onAfter3(builder, related);
  }

  // Assign what the query returns to the owners, once it has resolved, after its
  // `afterFind()` hook and `runAfter()` callbacks, which may filter or reorder
  // the related models. `range()` and `page()` wrap the models in `{ results, total }`.
  assignResult(builder, result) {
    if (this.assignResultToOwner && this.owner.isModels) {
      const related = asArray(builder.has(RangeOperation) ? result.results : result);

      for (const rel of related) {
        if (!this.ownerKeyByRelated.has(rel)) {
          throw new Error(
            `Unable to assign the result to relation "${this.relation.name}" of ` +
              `${this.relation.ownerModelClass.name}: afterFind() and runAfter() can only ` +
              'return the related models that the query found, filtered or reordered.',
          );
        }
      }

      this.assignRelated(related);
    }

    return result;
  }

  // @overridable
  assignRelated(related) {
    const isOneToOne = this.relation.isOneToOne();
    const relatedByOwnerKey = new Map();

    for (const rel of related) {
      const key = this.ownerKeyByRelated.get(rel);
      let arr = relatedByOwnerKey.get(key);

      if (!arr) {
        arr = [];
        relatedByOwnerKey.set(key, arr);
      }

      arr.push(rel);
    }

    for (const owner of this.owner.modelArray) {
      const related = relatedByOwnerKey.get(this.relation.ownerProp.propKey(owner));

      if (isOneToOne) {
        owner[this.relationProperty] = (related && related[0]) || null;
      } else {
        owner[this.relationProperty] = related || [];
      }
    }
  }

  // The key of the owner that a related model belongs to:
  getOwnerKey(related) {
    return this.relation.relatedProp.propKey(related);
  }

  // The expressions of the result rows in `table` that hold the keys of their
  // owners, including json references:
  ownerKeys(builder, table) {
    return this.relation.relatedProp
      .refs(builder)
      .map((ref) => ref.table(table).toKnexRaw(builder));
  }

  checkOwnerProps() {
    const { name, ownerModelClass, ownerProp } = this.relation;
    const owners = this.owner.modelArray;

    for (let c = 0, lc = ownerProp.size; c < lc; ++c) {
      // Owner models loaded without the join columns, e.g. with a partial
      // `select()`, would silently get no related models (#1832). Models built
      // in memory, e.g. returned by `insert()`, may not have them yet (#132).
      // Check the columns, not the values of JSON field expressions in them,
      // which a JSON document may leave out.
      const prop = ownerProp.props[c];

      if (owners.some((owner) => owner.$$isFromDatabase && owner[prop] === undefined)) {
        throw new Error(
          `Unable to fetch relation "${name}" of ${ownerModelClass.name}: some owner models ` +
            'loaded from the database are missing the join property ' +
            `"${ownerProp.propDescription(c)}". Select the column in the owner query.`,
        );
      }
    }

    if (this.assignResultToOwner) {
      this.checkOwnerKeys();
    }
  }

  // Related models can't be assigned to owner props holding an array of keys,
  // e.g. a JSON array column (#2667). `$relatedQuery()` without assigning the
  // results isn't affected.
  // @overridable
  checkOwnerKeys() {
    const { name, ownerModelClass, ownerProp, joinTable } = this.relation;
    const owners = this.owner.modelArray;

    for (let c = 0, lc = ownerProp.size; c < lc; ++c) {
      if (owners.some((owner) => Array.isArray(ownerProp.getProp(owner, c)))) {
        throw new Error(
          `Unable to fetch relation "${name}" of ${ownerModelClass.name}: the join property ` +
            `"${ownerProp.propDescription(c)}" of some owner models holds an array, which is ` +
            `not supported. ${
              joinTable
                ? 'Map the relation from a column that holds a single key instead.'
                : 'Use a BelongsToManyRelation or a ManyToManyRelation through a join table instead.'
            }`,
        );
      }
    }
  }

  // Related models without the join properties can't be assigned to their
  // owners (#2258). This happens for example when the relation mapping uses
  // column names but the rows come back with different property names, e.g.
  // snake_case mappings with `knexSnakeCaseMappers`.
  checkRelatedProps(related) {
    const { name, ownerModelClass, relatedProp } = this.relation;

    for (let c = 0, lc = relatedProp.size; c < lc; ++c) {
      if (related.some((rel) => relatedProp.getProp(rel, c) === undefined)) {
        throw new Error(
          `Unable to fetch relation "${name}" of ${ownerModelClass.name}: some related models ` +
            `are missing the join property "${relatedProp.propDescription(c)}". Check that the ` +
            'relation mapping uses the property names of the models, e.g. camelCase names when ' +
            'using knexSnakeCaseMappers.',
        );
      }
    }
  }

  selectMissingJoinColumns(builder) {
    const relatedProp = this.relation.relatedProp;
    const addedSelects = [];

    for (let c = 0, lc = relatedProp.size; c < lc; ++c) {
      const fullCol = relatedProp.ref(builder, c).fullColumn(builder);
      const prop = relatedProp.props[c];
      const col = relatedProp.cols[c];

      if (
        !builder.hasSelectionAs(fullCol, col) &&
        !hasAliasSelection(builder, col) &&
        addedSelects.indexOf(fullCol) === -1
      ) {
        this.omitFromResult(builder, prop);
        addedSelects.push(fullCol);
      }
    }

    if (addedSelects.length) {
      builder.select(addedSelects);
    }
  }

  maybeApplyAlias(builder) {
    if (!builder.alias() && this.alias) {
      builder.alias(this.alias);
    }
  }

  // Omits a property that was selected only to assign the related models to
  // their owners from the result, before any `runAfter()` hooks are called.
  omitFromResult(builder, prop) {
    if (!builder.internalOptions().keepImplicitJoinProps) {
      builder.addInternalSelection(prop);
    }
  }

  clone() {
    const clone = super.clone();

    clone.alwaysReturnArray = this.alwaysReturnArray;
    clone.assignResultToOwner = this.assignResultToOwner;
    clone.relationProperty = this.relationProperty;
    clone.alias = this.alias;
    clone.ownerKeyByRelated = this.ownerKeyByRelated;

    return clone;
  }
}
