import { GraphOperation } from '../GraphOperation.js';
import { GraphRecursiveUpsertAction } from './GraphRecursiveUpsertAction.js';

export class GraphRecursiveUpsert extends GraphOperation {
  createActions() {
    return [
      new GraphRecursiveUpsertAction(this.graphData, {
        nodes: this.graph.nodes.filter(
          (node) => this.graphData.actions.get(node) === 'relate' && hasRelations(node.obj),
        ),
      }),
    ];
  }
}

function hasRelations(obj) {
  for (const relationName of obj.constructor.getRelationNames()) {
    if (obj[relationName] !== undefined) {
      return true;
    }
  }

  return false;
}
