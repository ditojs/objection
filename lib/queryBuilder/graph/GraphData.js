export class GraphData {
  constructor({ graph, currentGraph, graphOptions, nodeDbExistence }) {
    this.graph = graph;
    this.currentGraph = currentGraph;
    this.graphOptions = graphOptions;
    this.nodeDbExistence = nodeDbExistence;
    // Pruning replaces `graph.nodes`, but `keptNodeForRow()` also needs the
    // branches below related nodes.
    this._unprunedNodes = graph.nodes;
    this._keptNodesByRowKey = null;
    this.actions = null;
  }

  // Decide what to do with each node once, before the first write, since the
  // writes change the models that the rules of `GraphOptions` read. Only call
  // this after pruning.
  planActions() {
    const { graph, currentGraph, graphOptions } = this;
    this.actions = new Map();

    for (const node of graph.nodes) {
      this.actions.set(
        node,
        graphOptions.shouldInsert(node, this)
          ? 'insert'
          : graphOptions.shouldRelate(node, this)
            ? 'relate'
            : graphOptions.shouldPatchOrUpdateIgnoreDisable(node, this)
              ? 'patch'
              : 'ignore',
      );
    }

    for (const currentNode of currentGraph.nodes) {
      this.actions.set(
        currentNode,
        graphOptions.shouldDelete(currentNode, this)
          ? 'delete'
          : graphOptions.shouldUnrelate(currentNode, this)
            ? 'unrelate'
            : 'keep',
      );
    }

    return this;
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
