import { GraphOperation } from '../GraphOperation.js';
import { GraphDeleteAction } from './GraphDeleteAction.js';

export class GraphDelete extends GraphOperation {
  // The owner of a BelongsToOneRelation row references it until `GraphPatch`
  // points the owner to a new row or to null. These rows are deleted
  // afterwards by `GraphDereferencedBelongsToOneDelete`, all others before.
  get deletesDereferencedRows() {
    return false;
  }

  createActions() {
    return [
      new GraphDeleteAction(this.graphData, {
        nodes: this.currentGraph.nodes.filter(
          (currentNode) =>
            this.graphData.actions.get(currentNode) !== 'keep' &&
            isDereferencedBelongsToOneNode(currentNode, this.graphData) ===
              this.deletesDereferencedRows,
        ),
        areReferenced: !this.deletesDereferencedRows,
      }),
    ];
  }
}

export class GraphDereferencedBelongsToOneDelete extends GraphDelete {
  get deletesDereferencedRows() {
    return true;
  }
}

// The graph replaces or removes the BelongsToOneRelation rows that it deletes
// below owners in the graph, and `GraphPatch` points the owners to the new rows
// or to null first, like `unrelate()`, also if their schemas don't allow null.
function isDereferencedBelongsToOneNode(currentNode, graphData) {
  const relation = currentNode.parentEdge?.relation;

  return (
    !!relation?.isObjectionBelongsToOneRelation &&
    !!graphData.graph.nodeForNode(currentNode.parentNode)
  );
}
