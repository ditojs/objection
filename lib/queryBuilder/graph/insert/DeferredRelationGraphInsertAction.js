import { GraphAction } from '../GraphAction.js';
import { groupBy } from '../../../utils/objectUtils.js';
import * as promiseUtils from '../../../utils/promiseUtils/index.js';

/**
 * Patches in the foreign keys of `BelongsToOneRelation` edges that `GraphInsert`
 * had to defer to break a dependency cycle. The owner nodes of these edges were
 * inserted without the foreign keys. `GraphInsertAction` already copied them to
 * the owner objects once the related nodes were inserted, so all that's left to
 * do is one patch query per owner.
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

    for (const { relation } of edges) {
      const { ownerProp } = relation;

      ownerProp.forEach((i) => {
        ownerProp.patch(patch, i, ownerProp.getProp(ownerNode.obj, i));
      });
    }

    return modelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .whereInComposite(ownerIdProp.refs(builder), [ownerIdProp.getProps(ownerNode.obj)]);
  }
}
