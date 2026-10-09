'use strict';

const { GraphAction } = require('../GraphAction');
const promiseUtils = require('../../../utils/promiseUtils');

/**
 * Sets the foreign keys of `BelongsToOneRelation` edges that `GraphInsert`
 * had to defer to break a dependency cycle. The owner nodes of these edges
 * were inserted without the foreign key, and it's now patched in once the
 * related node has been inserted.
 */
class DeferredRelationGraphInsertAction extends GraphAction {
  constructor(graphData, { edges }) {
    super(graphData);

    // `BelongsToOneRelation` edges whose owner node needs to be patched.
    this.edges = edges;
  }

  run(builder) {
    const concurrency = this._getConcurrency(
      builder,
      this.edges.map((edge) => edge.ownerNode),
    );

    return promiseUtils.map(this.edges, (edge) => this._patchOwner(builder, edge), {
      concurrency,
    });
  }

  _patchOwner(builder, edge) {
    const { ownerNode, relatedNode, relation } = edge;
    const { ownerProp } = relation;
    const patch = {};

    this._resolveRelationDependency(relatedNode, edge);

    ownerProp.forEach((i) => {
      ownerProp.patch(patch, i, ownerProp.getProp(ownerNode.obj, i));
    });

    const ownerIdProp = relation.ownerModelClass.getIdRelationProperty();

    return relation.ownerModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .whereInComposite(ownerIdProp.refs(builder), [ownerIdProp.getProps(ownerNode.obj)]);
  }
}

module.exports = {
  DeferredRelationGraphInsertAction,
};
