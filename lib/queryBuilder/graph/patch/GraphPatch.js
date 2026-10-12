import { GraphOperation } from '../GraphOperation.js';
import { createPatchActions, isRelatedFirst } from './GraphRelate.js';

export class GraphPatch extends GraphOperation {
  createActions() {
    return createPatchActions(
      this.graphData,
      this.graph.nodes.filter((node) => {
        const action = this.graphData.actions.get(node);
        return (action === 'relate' && !isRelatedFirst(node, this.graphData)) || action === 'patch';
      }),
    );
  }
}
