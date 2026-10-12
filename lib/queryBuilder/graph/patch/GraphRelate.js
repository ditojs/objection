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

    return createPatchActions(this.graphData, nodes);
  }
}

// A relate into the slot of a HasOneRelation runs after the relate that moves
// the row in it to another owner, as the foreign key may be unique. Order the
// patches of `nodes` in as many actions as the chains of such moves need.
export function createPatchActions(graphData, nodes) {
  const actions = [];
  let pending = nodes;

  while (pending.length > 0) {
    const ready = pending.filter((node) => !pending.includes(getSlotMoverNode(node, graphData)));
    // Swapped rows can't be ordered, so we relate them together:
    const batch = ready.length > 0 ? ready : pending;
    actions.push(new GraphPatchAction(graphData, { nodes: batch }));
    pending = pending.filter((node) => !batch.includes(node));
  }

  return actions;
}

// `#ref` nodes wait for the inserts, as their ids may come from them. A relate
// into the slot of a HasOneRelation waits for `GraphDelete` to remove the row
// in it, as the foreign key may be unique, and for the relate that moves it
// to another owner if that one waits.
export function isRelatedFirst(node, graphData, visitedNodes = new Set()) {
  const { currentGraph, actions } = graphData;
  const relation = node.parentEdge?.relation;
  const slotNode = getCurrentSlotNode(node, graphData);
  const moverNode = getSlotMoverNode(node, graphData);

  visitedNodes.add(node);

  return (
    actions.get(node) === 'relate' &&
    !node.isReference &&
    !!relation?.isObjectionHasManyRelation &&
    !!currentGraph.nodeForNode(node.parentNode) &&
    !(slotNode && actions.get(slotNode) !== 'keep') &&
    // Swapped rows are related together:
    (!moverNode ||
      visitedNodes.has(moverNode) ||
      isRelatedFirst(moverNode, graphData, visitedNodes))
  );
}

// Find the relate that moves the current row in the slot of the HasOneRelation
// that `node` relates into to another owner:
function getSlotMoverNode(node, graphData) {
  const slotNode = graphData.actions.get(node) === 'relate' && getCurrentSlotNode(node, graphData);
  const keptNode = slotNode && graphData.keptNodeForRow(slotNode);

  return keptNode && graphData.actions.get(keptNode) === 'relate' ? keptNode : null;
}

// Find the current node in the slot of the HasOneRelation that `node` relates
// into, or null if it relates into a HasManyRelation or an empty slot:
function getCurrentSlotNode(node, graphData) {
  const relation = node.parentEdge?.relation;
  const currentParentNode = graphData.currentGraph.nodeForNode(node.parentNode);
  const edge =
    relation?.isOneToOne() &&
    currentParentNode?.edges.find(
      (edge) => edge.relation === relation && edge.isOwnerNode(currentParentNode),
    );

  return edge?.relatedNode ?? null;
}
