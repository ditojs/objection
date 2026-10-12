import { GraphOperation } from '../GraphOperation.js';
import { GraphDeleteAction } from './GraphDeleteAction.js';

export class GraphDelete extends GraphOperation {
  // The rows of BelongsToOneRelations are referenced by their owners, and are
  // deleted after `GraphPatch` points the owners to new rows or to null, like
  // `unrelate()`. All other rows reference their owners, and are deleted
  // before the inserts, which may need their unique keys.
  constructor(graphData, { belongsToOne }) {
    super(graphData);
    this.belongsToOne = belongsToOne;
  }

  createActions() {
    return [
      new GraphDeleteAction(this.graphData, {
        nodes: this.currentGraph.nodes.filter(
          (currentNode) =>
            this.graphData.actions.get(currentNode) !== 'keep' &&
            !!currentNode.parentEdge.relation.isObjectionBelongsToOneRelation === this.belongsToOne,
        ),
        areReferenced: !this.belongsToOne,
      }),
    ];
  }
}
