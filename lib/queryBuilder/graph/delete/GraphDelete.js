'use strict';

const { GraphOperation } = require('../GraphOperation');
const { GraphDeleteAction } = require('./GraphDeleteAction');
const { getPropertyTypes } = require('../../../model/modelJsonAttributes');

class GraphDelete extends GraphOperation {
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
            this.graphOptions.shouldDeleteOrUnrelate(currentNode, this.graphData) &&
            isDereferencedBelongsToOneNode(currentNode, this.graphData) ===
              this.deletesDereferencedRows,
        ),
        areReferenced: !this.deletesDereferencedRows,
      }),
    ];
  }
}

class GraphDereferencedBelongsToOneDelete extends GraphDelete {
  get deletesDereferencedRows() {
    return true;
  }
}

function isDereferencedBelongsToOneNode(currentNode, graphData) {
  const { graph, graphOptions } = graphData;
  const relation = currentNode.parentEdge?.relation;
  const parentNode = graph.nodeForNode(currentNode.parentNode);

  if (relation?.isObjectionBelongsToOneRelation && parentNode) {
    const node = graph.nodeForNode(currentNode);
    const isReplaced = parentNode.edges.some(
      (edge) =>
        edge.relation === relation &&
        edge.isOwnerNode(parentNode) &&
        !graphOptions.shouldIgnore(edge.relatedNode, graphData),
    );
    const isRemoved =
      parentNode.obj[relation.name] === null || (!!node && node.toBeUnrelatedOrDeleted);

    // Removing the row sets the owner's foreign key to null, but only where
    // its schema allows it. Otherwise we delete the row first and leave the
    // owner's reference to the database, as the column may be `NOT NULL`.
    return (
      isReplaced ||
      (isRemoved &&
        relation.ownerProp.props.every((prop) => isNullable(relation.ownerModelClass, prop)))
    );
  } else {
    return false;
  }
}

function isNullable(modelClass, prop) {
  const schema = modelClass.getJsonSchema()?.properties?.[prop];
  return !!schema && (schema.nullable === true || getPropertyTypes(schema).includes('null'));
}

module.exports = {
  GraphDelete,
  GraphDereferencedBelongsToOneDelete,
};
