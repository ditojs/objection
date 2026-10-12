import { GraphOperation } from '../GraphOperation.js';
import { GraphPatchAction } from './GraphPatchAction.js';

// Relate the rows that move to existing owners of HasManyRelations and
// HasOneRelations before `GraphDelete` runs, as they may still sit below rows
// that it deletes, e.g. with `ON DELETE CASCADE` (#214).
export class GraphRelate extends GraphOperation {
  createActions() {
    const nodes = this.graph.nodes.filter((node) => isRelatedFirst(node, this.graphData));

    for (const node of nodes) {
      const { relation } = node.parentEdge;
      const { ownerProp, relatedProp } = relation;
      const currentParentNode = this.currentGraph.nodeForNode(node.parentNode);

      // The graph may leave out the owner's key if it isn't the id:
      relatedProp.forEach((i) => {
        relatedProp.setProp(
          node.obj,
          i,
          ownerProp.getProp(node.parentNode.obj, i) ?? ownerProp.getProp(currentParentNode.obj, i),
        );
      });
    }

    return [new GraphPatchAction(this.graphData, { nodes })];
  }
}

// `#ref` nodes wait for the inserts, as their ids may come from them. A relate
// into the slot of a HasOneRelation waits for `GraphDelete` to remove the row
// in it, as the foreign key may be unique.
export function isRelatedFirst(node, graphData) {
  const { currentGraph, actions } = graphData;
  const relation = node.parentEdge?.relation;
  const currentParentNode = currentGraph.nodeForNode(node.parentNode);

  return (
    actions.get(node) === 'relate' &&
    !node.isReference &&
    !!relation?.isObjectionHasManyRelation &&
    !!currentParentNode &&
    !(
      relation.isOneToOne() &&
      currentParentNode.edges.some(
        (edge) =>
          edge.relation === relation &&
          edge.isOwnerNode(currentParentNode) &&
          actions.get(edge.relatedNode) !== 'keep',
      )
    )
  );
}
