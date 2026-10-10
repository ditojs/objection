import { GraphOperation } from '../GraphOperation.js';
import { GraphPatchAction } from './GraphPatchAction.js';

class GraphPatch extends GraphOperation {
  createActions() {
    return [
      new GraphPatchAction(this.graphData, {
        nodes: this.graph.nodes.filter((node) =>
          this.graphOptions.shouldPatchOrUpdateIgnoreDisable(node, this.graphData),
        ),
      }),
    ];
  }
}

export { GraphPatch };
