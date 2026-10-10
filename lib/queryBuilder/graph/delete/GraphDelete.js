import { GraphOperation } from '../GraphOperation.js';
import { GraphDeleteAction } from './GraphDeleteAction.js';

export class GraphDelete extends GraphOperation {
  createActions() {
    return [
      new GraphDeleteAction(this.graphData, {
        nodes: this.currentGraph.nodes.filter((currentNode) =>
          this.graphOptions.shouldDeleteOrUnrelate(currentNode, this.graphData),
        ),
      }),
    ];
  }
}
