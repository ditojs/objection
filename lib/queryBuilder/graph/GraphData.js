'use strict';

class GraphData {
  constructor({ graph, currentGraph, graphOptions, nodeDbExistence }) {
    this.graph = graph;
    this.currentGraph = currentGraph;
    this.graphOptions = graphOptions;
    this.nodeDbExistence = nodeDbExistence;
    this._keptNodesByRowKey = null;
  }

  // Find the node that keeps the row of `currentNode` in another place of the
  // graph, by relating or patching it there. Only call this after pruning.
  keptNodeForRow(currentNode) {
    if (!this._keptNodesByRowKey) {
      this._keptNodesByRowKey = new Map();

      for (const node of this.graph.nodes) {
        if (node.obj.$hasId() && this.graphOptions.shouldPatchOrUpdateIgnoreDisable(node, this)) {
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

module.exports = {
  GraphData,
};
