import { GraphAction } from '../GraphAction.js';
import { groupBy } from '../../../utils/objectUtils.js';
import * as promiseUtils from '../../../utils/promiseUtils/index.js';

/**
 * Patches in the foreign keys of `BelongsToOneRelation` edges that `GraphInsert`
 * had to defer to break a dependency cycle. The owner nodes of these edges were
 * inserted without the foreign keys, which are copied from the related nodes
 * and patched in with one query per owner.
 */
export class DeferredRelationGraphInsertAction extends GraphAction {
  constructor(graphData, { edges }) {
    super(graphData);

    // `BelongsToOneRelation` edges whose owner node needs to be patched.
    this.edges = edges;
  }

  run(builder) {
    const edgesByOwner = groupBy(this.edges, (edge) => edge.ownerNode);
    const owners = [...edgesByOwner.keys()];
    const concurrency = this._getConcurrency(builder, owners);

    return promiseUtils.map(
      owners,
      (owner) => this._patchOwner(builder, owner, edgesByOwner.get(owner)),
      { concurrency },
    );
  }

  _patchOwner(builder, ownerNode, edges) {
    const { modelClass } = ownerNode;
    const ownerIdProp = modelClass.getIdRelationProperty();
    const patch = {};

    for (const { relation, relatedNode } of edges) {
      const { ownerProp, relatedProp } = relation;

      ownerProp.forEach((i) => {
        const value = relatedProp.getProp(relatedNode.obj, i);
        ownerProp.setProp(ownerNode.obj, i, value);
        ownerProp.patch(patch, i, value);
      });
    }

    return modelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .whereInComposite(ownerIdProp.refs(builder), [ownerIdProp.getProps(ownerNode.obj)]);
  }
}
