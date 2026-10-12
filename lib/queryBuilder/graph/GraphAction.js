import { isPostgres } from '../../utils/knexUtils.js';
import { jsonEquals } from '../../utils/objectUtils.js';

const POSTGRES_MAX_INSERT_BATCH_SIZE = 100;
const MAX_CONCURRENCY = 100;

export class GraphAction {
  constructor(graphData) {
    this.graphData = graphData;
  }

  static get ReturningAllSelector() {
    return (op) => {
      // Only select `returning('*')` operation.
      return op.name === 'returning' && op.args.includes('*');
    };
  }

  static getConcurrency(builder, nodes) {
    return nodes.reduce((minConcurrency, node) => {
      return Math.min(minConcurrency, node.modelClass.getConcurrency(builder.unsafeKnex()));
    }, MAX_CONCURRENCY);
  }

  get graph() {
    return this.graphData.graph;
  }

  get currentGraph() {
    return this.graphData.currentGraph;
  }

  get graphOptions() {
    return this.graphData.graphOptions;
  }

  run(builder) {
    return null;
  }

  _getConcurrency(builder, nodes) {
    return GraphAction.getConcurrency(builder, nodes);
  }

  _getBatchSize(builder) {
    return isPostgres(builder.unsafeKnex()) ? POSTGRES_MAX_INSERT_BATCH_SIZE : 1;
  }

  // Change the arrays of keys of the BelongsToManyRelations that the graph
  // holds for `node`: Remove the keys of the current related models that it
  // deletes or unrelates, and add the keys of the related models that it
  // inserts, relates or patches. Other keys stay, e.g. of rows that the
  // relation's filter leaves out. Return the props that change.
  _setBelongsToManyKeys(node) {
    const { actions } = this.graphData;
    const currentNode = this.currentGraph.nodeForNode(node);
    const changedProps = [];

    const getRelatedNodes = (ownerNode, relation) =>
      ownerNode
        ? ownerNode.edges
            .filter((edge) => edge.relation === relation && edge.isOwnerNode(ownerNode))
            .map((edge) => edge.relatedNode)
        : [];

    // Relations that the graph leaves out keep their arrays, and aren't loaded
    // (#1202):
    const relations = node.modelClass
      .getRelationNames()
      .filter((name) => node.obj[name] !== undefined)
      .map((name) => node.modelClass.getRelation(name))
      .filter((relation) => relation.isObjectionBelongsToManyRelation);

    for (const relation of relations) {
      const { ownerProp, relatedProp } = relation;
      const getKey = (related) => relatedProp.getProp(related.obj, 0);
      const keys = relation.getKeys(currentNode ? currentNode.obj : node.obj);

      const removed = getRelatedNodes(currentNode, relation).filter((related) =>
        ['delete', 'unrelate'].includes(actions.get(related)),
      );
      const added = getRelatedNodes(node, relation).filter(
        (related) => !related.toBeUnrelatedOrDeleted && actions.get(related) !== 'ignore',
      );

      for (const related of added) {
        this._resolveReferences(related);
      }

      const newKeys = relation.changeKeys(keys, {
        add: added.map(getKey),
        remove: removed.map(getKey),
      });

      if (!currentNode || this.graphOptions.shouldUpdate(node)) {
        // Inserts and updates write the whole row:
        ownerProp.setProp(node.obj, 0, newKeys);
        changedProps.push(ownerProp.props[0]);
      } else if (!jsonEquals(keys, newKeys)) {
        const patch = relation.createKeysPatch(currentNode.obj, newKeys);
        Object.assign(node.obj, patch);
        changedProps.push(...Object.keys(patch));
      }
    }

    return changedProps;
  }

  _resolveReferences(node) {
    if (node.isReference) {
      this._resolveReference(node);
    }
  }

  _resolveReference(node) {
    const refNode = node.referencedNode;

    for (const prop of Object.keys(refNode.obj)) {
      if (!node.obj.hasOwnProperty(prop)) {
        node.obj[prop] = refNode.obj[prop];
      }
    }
  }
}
