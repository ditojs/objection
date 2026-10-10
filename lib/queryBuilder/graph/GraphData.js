class GraphData {
  constructor({ graph, currentGraph, graphOptions, nodeDbExistence }) {
    this.graph = graph;
    this.currentGraph = currentGraph;
    this.graphOptions = graphOptions;
    this.nodeDbExistence = nodeDbExistence;
    // Pruning replaces `graph.nodes`, but `keptNodeForRow()` also needs the
    // branches below related nodes.
    this._unprunedNodes = graph.nodes;
    this._keptNodesByRowKey = null;
  }

  // Find the node that keeps the row of `currentNode` in another place of the
  // graph, by relating or patching it there, or by upserting it below a related
  // node. Only call this after pruning.
  keptNodeForRow(currentNode) {
    if (!this._keptNodesByRowKey) {
      this._keptNodesByRowKey = new Map();
      const nodes = new Set(this.graph.nodes);

      // Nested upserts write the pruned branches below related nodes, except
      // for models marked with `#unrelate` or `#delete` and their descendants:
      const isUpsertedBelowRelatedNode = (node) =>
        !node.toBeUnrelatedOrDeleted &&
        (nodes.has(node.parentNode)
          ? this.graphOptions.shouldRelate(node.parentNode, this)
          : isUpsertedBelowRelatedNode(node.parentNode));

      for (const node of this._unprunedNodes) {
        if (
          node.obj.$hasId() &&
          (nodes.has(node)
            ? this.graphOptions.shouldPatchOrUpdateIgnoreDisable(node, this)
            : isUpsertedBelowRelatedNode(node))
        ) {
          this._keptNodesByRowKey.set(getRowKey(node), node);
        }
      }
    }

    return this._keptNodesByRowKey.get(getRowKey(currentNode)) || null;
  }
}

function getRowKey(node) {
  return `${node.modelClass.getTableName()}:${node.obj.$idKey()}`;
}

export { GraphData };
