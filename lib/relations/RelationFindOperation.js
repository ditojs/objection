import { FindOperation } from '../queryBuilder/operations/FindOperation.js';
import { deprecate } from '../utils/deprecate.js';

class RelationFindOperation extends FindOperation {
  constructor(name, opt) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.alwaysReturnArray = false;
    this.assignResultToOwner = true;
    this.relationProperty = opt.relationProperty || this.relation.name;
    this.omitProps = [];
    this.alias = null;
  }

  onBuild(builder) {
    this.maybeApplyAlias(builder);
    this.relation.findQuery(builder, this.owner);

    if (this.owner.isModels) {
      this.warnOnMissingOwnerProps();

      if (this.assignResultToOwner) {
        this.warnOnArrayOwnerProps();
        this.selectMissingJoinColumns(builder);
      }
    }
  }

  onAfter2(_, related) {
    const isOneToOne = this.relation.isOneToOne();

    if (this.assignResultToOwner && this.owner.isModels) {
      const owners = this.owner.modelArray;
      const relatedByOwnerId = new Map();

      for (let i = 0, l = related.length; i < l; ++i) {
        const rel = related[i];
        const key = this.relation.relatedProp.propKey(rel);
        let arr = relatedByOwnerId.get(key);

        if (!arr) {
          arr = [];
          relatedByOwnerId.set(key, arr);
        }

        arr.push(rel);
      }

      this.warnOnMissingRelatedProps(related);

      for (let i = 0, l = owners.length; i < l; ++i) {
        const own = owners[i];
        const key = this.relation.ownerProp.propKey(own);
        const related = relatedByOwnerId.get(key);

        if (isOneToOne) {
          own[this.relationProperty] = (related && related[0]) || null;
        } else {
          own[this.relationProperty] = related || [];
        }
      }
    }

    return related;
  }

  onAfter3(builder, related) {
    const isOneToOne = this.relation.isOneToOne();
    const intOpt = builder.internalOptions();

    if (!intOpt.keepImplicitJoinProps) {
      this.omitImplicitJoinProps(related);
    }

    if (!this.alwaysReturnArray && isOneToOne && related.length <= 1) {
      related = related[0] || undefined;
    }

    return super.onAfter3(builder, related);
  }

  // Owner models without the join columns, e.g. loaded with a partial
  // `select()`, silently get no related models (#1832). Only `undefined`
  // is reported, as `null` is a legit value for a missing relation, and
  // owner props that may legitimately be unset are skipped (#132).
  // TODO: Consider throwing an error instead in objection 4.0.
  warnOnMissingOwnerProps() {
    const { ownerProp } = this.relation;

    for (let c = 0, lc = ownerProp.size; c < lc; ++c) {
      if (this.relation.isOptionalOwnerProp(c)) {
        continue;
      }

      if (this.owner.modelArray.some((owner) => ownerProp.getProp(owner, c) === undefined)) {
        deprecate(
          `Fetching relation "${this.relation.name}" of ${this.relation.ownerModelClass.name}: ` +
            `some owner models are missing the join property "${ownerProp.propDescription(c)}", ` +
            'so no related models are found for them. Select the column in the owner query.',
        );
      }
    }
  }

  // Owner join properties holding an array of keys, e.g. a JSON array column,
  // aren't supported: The query finds the related models, but they can't be
  // assigned to their owners, so all owners silently get no related models
  // (#2667). `$relatedQuery()` without assigning the results isn't affected.
  warnOnArrayOwnerProps() {
    const { ownerProp } = this.relation;

    for (let c = 0, lc = ownerProp.size; c < lc; ++c) {
      if (this.owner.modelArray.some((owner) => Array.isArray(ownerProp.getProp(owner, c)))) {
        deprecate(
          `Fetching relation "${this.relation.name}" of ${this.relation.ownerModelClass.name}: ` +
            `the join property "${ownerProp.propDescription(c)}" of some owner models holds ` +
            'an array, which is not supported, so no related models are found for them. ' +
            'Use a ManyToManyRelation through a join table instead.',
        );
      }
    }
  }

  // Related models without the join properties can't be assigned to their
  // owners and are silently dropped (#2258). This happens for example when the
  // relation mapping uses column names but the rows come back with different
  // property names, e.g. snake_case mappings with `knexSnakeCaseMappers`.
  warnOnMissingRelatedProps(related) {
    const { relatedProp } = this.relation;

    for (let c = 0, lc = relatedProp.size; c < lc; ++c) {
      if (related.some((rel) => relatedProp.getProp(rel, c) === undefined)) {
        deprecate(
          `Fetching relation "${this.relation.name}" of ${this.relation.ownerModelClass.name}: ` +
            `some related models are missing the join property "${relatedProp.propDescription(c)}", ` +
            'so they are not assigned to any owner. Check that the relation mapping uses the ' +
            'property names of the models, e.g. camelCase names when using knexSnakeCaseMappers.',
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

      if (!builder.hasSelectionAs(fullCol, col) && addedSelects.indexOf(fullCol) === -1) {
        this.omitProps.push(prop);
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

  omitImplicitJoinProps(related) {
    const relatedModelClass = this.relation.relatedModelClass;

    if (!this.omitProps.length || !related) {
      return related;
    }

    if (!Array.isArray(related)) {
      return this.omitImplicitJoinPropsFromOne(relatedModelClass, related);
    }

    if (!related.length) {
      return related;
    }

    for (let i = 0, l = related.length; i < l; ++i) {
      this.omitImplicitJoinPropsFromOne(relatedModelClass, related[i]);
    }

    return related;
  }

  omitImplicitJoinPropsFromOne(relatedModelClass, model) {
    for (let c = 0, lc = this.omitProps.length; c < lc; ++c) {
      relatedModelClass.omitImpl(model, this.omitProps[c]);
    }

    return model;
  }

  clone() {
    const clone = super.clone();

    clone.alwaysReturnArray = this.alwaysReturnArray;
    clone.assignResultToOwner = this.assignResultToOwner;
    clone.relationProperty = this.relationProperty;
    clone.omitProps = this.omitProps.slice();
    clone.alias = this.alias;

    return clone;
  }
}

export { RelationFindOperation };
