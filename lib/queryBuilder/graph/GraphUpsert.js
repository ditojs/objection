import { ModelGraph } from '../../model/graph/ModelGraph.js';
import { ModelGraphEdge } from '../../model/graph/ModelGraphEdge.js';
import { createNotModelError } from '../../model/graph/ModelGraphBuilder.js';
import { GraphFetcher } from '../graph/GraphFetcher.js';
import { GraphInsert } from './insert/GraphInsert.js';
import { GraphPatch } from './patch/GraphPatch.js';
import { GraphRelate } from './patch/GraphRelate.js';
import { GraphDelete } from './delete/GraphDelete.js';
import { GraphRecursiveUpsert } from './recursiveUpsert/GraphRecursiveUpsert.js';
import { GraphOptions } from './GraphOptions.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { RelationExpression } from '../RelationExpression.js';
import { GraphNodeDbExistence } from './GraphNodeDbExistence.js';
import { GraphData } from './GraphData.js';
import { uniqBy, asArray, isObject } from '../../utils/objectUtils.js';

export class GraphUpsert {
  constructor({ rootModelClass, objects, upsertOptions, insertOnly = false }) {
    checkCanBeConvertedToModels(rootModelClass, objects);

    this.objects = rootModelClass.ensureModelArray(objects, GraphUpsert.modelOptions);
    this.isArray = Array.isArray(objects);
    this.graphOptions = new GraphOptions(upsertOptions, [], insertOnly);
  }

  static get modelOptions() {
    return { skipValidation: true };
  }

  // A graph is written using many insert queries (one per batch and table),
  // so there's no single insert query an `onConflict` clause could be applied
  // to. Even applying it to the root table only would be unsound: rows skipped
  // by `ignore()` aren't returned, which leaves the root models without ids,
  // so that related rows would be inserted with missing or wrong foreign keys.
  static checkForOnConflict(builder, method) {
    if (builder.has(isOnConflictOperation)) {
      throw new Error(
        `onConflict(), ignore() and merge() are not supported by ${method}(). ` +
          'Insert the conflicting rows with a separate insert() query instead.',
      );
    }
  }

  run(builder) {
    const modelClass = builder.modelClass();
    const { graphOptions } = this;

    const graph = ModelGraph.create(modelClass, this.objects);
    checkForBelongsToManyRelations(modelClass, RelationExpression.fromModelGraph(this.objects));
    assignDbRefsAsRelateProps(graph);

    return createGraphData(builder, graphOptions, graph)
      .then(checkForErrors(builder))
      .then(pruneGraphs())
      .then((graphData) => graphData.planActions())
      .then(checkForJoinTableRelatedTableErrors(builder))
      .then(executeOperations(builder))
      .then(removeReferenceProps(graph.nodes))
      .then(returnResult(this.objects, this.isArray));
  }
}

function checkCanBeConvertedToModels(modelClass, objects) {
  // Wrap `undefined` too, so that it fails the check:
  for (const obj of Array.isArray(objects) ? objects : [objects]) {
    if (!isObject(obj)) {
      throw createNotModelError(modelClass, obj);
    }
  }
}

function checkForBelongsToManyRelations(modelClass, expression) {
  expression.forEachChildExpression(modelClass, (childExpression, relation) => {
    if (relation.isObjectionBelongsToManyRelation) {
      throw relation.createError('insertGraph() and upsertGraph() are not supported yet.');
    }

    checkForBelongsToManyRelations(relation.relatedModelClass, childExpression);
  });
}

function assignDbRefsAsRelateProps(graph) {
  for (const node of graph.nodes) {
    if (!node.parentEdge || !node.parentEdge.relation || !node.isDbReference) {
      continue;
    }

    node.parentEdge.relation.setRelateProp(node.obj, asArray(node.dbReference));
  }
}

async function createGraphData(builder, graphOptions, graph) {
  const currentGraph = await fetchCurrentGraph(builder, graphOptions, graph);

  const nodeDbExistence = await GraphNodeDbExistence.create({
    builder,
    graph,
    graphOptions,
    currentGraph,
  });

  return new GraphData({ graph, currentGraph, graphOptions, nodeDbExistence });
}

function fetchCurrentGraph(builder, graphOptions, graph) {
  if (graphOptions.isInsertOnly()) {
    return Promise.resolve(ModelGraph.createEmpty());
  } else {
    return GraphFetcher.fetchCurrentGraph({ builder, graph, graphOptions });
  }
}

// Remove branches from the graph that require no operations. For example
// we never want to do anything for descendant nodes of a node that is
// deleted or unrelated. We never delete recursively.
function pruneGraphs() {
  return (graphData) => {
    pruneRelatedBranches(graphData);
    pruneSkippedBranches(graphData);

    if (!graphData.graphOptions.isInsertOnly()) {
      pruneDeletedBranches(graphData);
      pruneUnrelatedOrDeletedBranches(graphData);
    }

    return graphData;
  };
}

function pruneRelatedBranches(graphData) {
  const relateNodes = graphData.graph.nodes.filter((node) => {
    return (
      !graphData.currentGraph.nodeForNode(node) &&
      !graphData.graphOptions.shouldInsertIgnoreDisable(node, graphData)
    );
  });

  removeBranchesFromGraph(findRoots(relateNodes), graphData.graph);
}

// Nothing is written below nodes that `noInsert` skips, as their descendants
// would be orphans (#215). Branches that references from outside point into
// are kept, since the references need their models.
function pruneSkippedBranches(graphData) {
  const { graph, graphOptions } = graphData;

  const skippedNodes = graph.nodes.filter((node) => {
    return (
      graphOptions.shouldInsertIgnoreDisable(node, graphData) &&
      !graphOptions.shouldInsert(node, graphData) &&
      !isReferencedFromOutside(node.descendantRelationNodes)
    );
  });

  removeBranchesFromGraph(findRoots(skippedNodes), graph);
}

function isReferencedFromOutside(nodes) {
  const nodeSet = new Set(nodes);

  return nodes.some((node) =>
    node.refEdges.some((edge) => edge.isRelatedNode(node) && !nodeSet.has(edge.ownerNode)),
  );
}

function pruneDeletedBranches(graphData) {
  const { graph, currentGraph } = graphData;

  const deleteNodes = currentGraph.nodes.filter((currentNode) => !graph.nodeForNode(currentNode));
  const roots = findRoots(deleteNodes);

  // Don't delete relations the current graph doesn't even mention.
  // So if the parent node doesn't even have the relation, it's not
  // supposed to be deleted.
  const rootsNotInRelation = roots.filter((deleteRoot) => {
    if (!deleteRoot.parentNode) {
      return false;
    }

    const { relation } = deleteRoot.parentEdge;
    const parentNode = graph.nodeForNode(deleteRoot.parentNode);

    if (!parentNode) {
      return false;
    }

    return parentNode.obj[relation.name] === undefined;
  });

  removeBranchesFromGraph(roots, currentGraph);
  removeNodesFromGraph(new Set(rootsNotInRelation), currentGraph);
}

// Models marked with `#unrelate` or `#delete` are unrelated or deleted
// as a whole. Their relations are ignored, both in the upserted graph
// and in the current graph.
function pruneUnrelatedOrDeletedBranches(graphData) {
  const { graph, currentGraph } = graphData;

  const roots = findRoots(graph.nodes.filter((node) => node.toBeUnrelatedOrDeleted));
  const currentRoots = roots.map((node) => currentGraph.nodeForNode(node)).filter(Boolean);

  removeBranchesFromGraph(roots, graph);
  removeBranchesFromGraph(currentRoots, currentGraph);
}

function findRoots(nodes) {
  const nodeSet = new Set(nodes);

  return uniqBy(
    nodes.filter((node) => {
      let parentNode = node.parentNode;

      while (parentNode) {
        if (nodeSet.has(parentNode)) {
          return false;
        }

        parentNode = parentNode.parentNode;
      }

      return true;
    }),
  );
}

function removeBranchesFromGraph(branchRoots, graph) {
  const nodesToRemove = new Set(
    branchRoots.reduce(
      (nodesToRemove, node) => [...nodesToRemove, ...node.descendantRelationNodes],
      [],
    ),
  );

  removeNodesFromGraph(nodesToRemove, graph);
}

function removeNodesFromGraph(nodesToRemove, graph) {
  const edgesToRemove = new Set();

  for (const node of nodesToRemove) {
    for (const edge of node.edges) {
      const otherNode = edge.getOtherNode(node);

      if (!nodesToRemove.has(otherNode)) {
        otherNode.removeEdge(edge);
        edgesToRemove.add(edge);
      }
    }
  }

  graph.nodes = graph.nodes.filter((node) => !nodesToRemove.has(node));
  graph.edges = graph.edges.filter((edge) => !edgesToRemove.has(edge));

  return graph;
}

function checkForErrors(builder) {
  return (graphData) => {
    checkForNotFoundErrors(graphData, builder);
    checkForUnallowedRelationErrors(graphData, builder);
    checkForUnallowedReferenceErrors(graphData, builder);
    // Root models can't be marked even with `allowMarkers`, so report that
    // first instead of pointing to the option.
    checkForRootUnrelateOrDeleteErrors(graphData, builder);
    checkForUnallowedMarkerErrors(graphData, builder);

    if (graphData.graphOptions.isInsertOnly()) {
      checkForHasManyRelateErrors(graphData);
      checkForInsertBelowRelateErrors(graphData, builder);
    }

    return graphData;
  };
}

// Inserting or relating a node of a many-to-many relation inserts a join row,
// which would be a new related row if the join table is also the related
// table (#133). Check this before this graph is written. It runs after
// pruning, as the branches below related nodes are upserted and checked by
// nested `upsertGraph` calls against their own current graphs.
function checkForJoinTableRelatedTableErrors(builder) {
  return (graphData) => {
    const { currentGraph, graph, actions } = graphData;

    for (const node of graph.nodes) {
      const relation = node.parentEdge && node.parentEdge.relation;
      const action = actions.get(node);

      if (
        relation &&
        relation.isObjectionManyToManyRelation &&
        !currentGraph.nodeForNode(node) &&
        (action === 'insert' || action === 'relate')
      ) {
        relation.assertCanModifyJoinTable(builder, action);
      }
    }

    return graphData;
  };
}

function checkForNotFoundErrors(graphData, builder) {
  const { graphOptions, currentGraph, graph } = graphData;
  // The branches below related nodes are upserted and checked by nested
  // `upsertGraph` calls, against the current graphs of the related nodes:
  const nestedNodes = new Set(
    graph.nodes
      .filter((node) => graphOptions.shouldRelate(node, graphData))
      .flatMap((node) => node.descendantRelationNodes),
  );

  for (const node of graph.nodes) {
    if (
      node.obj.$hasId() &&
      !nestedNodes.has(node) &&
      !node.toBeUnrelatedOrDeleted &&
      !graphOptions.shouldInsertIgnoreDisable(node, graphData) &&
      !graphOptions.shouldRelateIgnoreDisable(node, graphData) &&
      !currentGraph.nodeForNode(node)
    ) {
      if (!node.parentNode) {
        throw node.modelClass.createNotFoundError(builder.context(), {
          message: `root model (id=${node.obj.$id()}) does not exist. If you want to insert it with an id, use the insertMissing option`,
          dataPath: node.dataPath,
        });
      } else {
        throw node.modelClass.createNotFoundError(builder.context(), {
          message: `model (id=${node.obj.$id()}) is not a child of model (id=${node.parentNode.obj.$id()}). If you want to relate it, use the relate option. If you want to insert it with an id, use the insertMissing option`,
          dataPath: node.dataPath,
        });
      }
    }
  }
}

function checkForUnallowedRelationErrors(graphData, builder) {
  const { graph } = graphData;
  const allowedExpression = builder.allowedGraphExpression();

  if (allowedExpression) {
    const rootsObjs = graph.nodes.filter((node) => !node.parentEdge).map((node) => node.obj);
    const expression = RelationExpression.fromModelGraph(rootsObjs);

    if (!allowedExpression.isSubExpression(expression)) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.UnallowedRelation,
        message: 'trying to upsert an unallowed relation',
      });
    }
  }
}

function checkForUnallowedReferenceErrors(graphData, builder) {
  const { graph, graphOptions } = graphData;

  if (graphOptions.allowRefs()) {
    return;
  }

  if (graph.edges.some((edge) => edge.type === ModelGraphEdge.Type.Reference)) {
    throw builder.modelClass().createValidationError({
      type: ValidationErrorType.InvalidGraph,
      message:
        '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
    });
  }
}

// `#unrelate` and `#delete` markers come from the graph data, which may be
// untrusted input. Like `#ref`, they have to be allowed explicitly (#2410).
// An insert has nothing to unrelate or delete, so `insertGraph` rejects them.
function checkForUnallowedMarkerErrors(graphData, builder) {
  const { graph, graphOptions } = graphData;

  if (graphOptions.allowMarkers()) {
    return;
  }

  const node = graph.nodes.find((node) => node.toBeUnrelatedOrDeleted);

  if (node) {
    const { graphUnrelateProp, graphDeleteProp } = node.modelClass;

    throw builder.modelClass().createValidationError({
      type: ValidationErrorType.InvalidGraph,
      message: graphOptions.isInsertOnly()
        ? `${graphUnrelateProp} and ${graphDeleteProp} can only be used in upsertGraph, not in insertGraph`
        : `${graphUnrelateProp} and ${graphDeleteProp} markers are not allowed in a graph by default. see the allowMarkers upsertGraph option`,
    });
  }
}

function checkForRootUnrelateOrDeleteErrors(graphData, builder) {
  for (const node of graphData.graph.nodes) {
    if (!node.parentEdge && node.toBeUnrelatedOrDeleted) {
      const { graphUnrelateProp, graphDeleteProp } = node.modelClass;

      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `${graphUnrelateProp} and ${graphDeleteProp} can only be used for related models, not for root models`,
      });
    }
  }
}

function checkForHasManyRelateErrors(graphData) {
  const { graph, graphOptions } = graphData;

  for (const node of graph.nodes) {
    if (
      graphOptions.shouldRelate(node, graphData) &&
      node.parentEdge.relation.isObjectionHasManyRelation
    ) {
      throw new Error(
        'You cannot relate HasManyRelation or HasOneRelation using insertGraph, because those require update operations. Consider using upsertGraph instead.',
      );
    }
  }
}

// `upsertGraph` upserts the branches below related models recursively, but
// `insertGraph` prunes them, which would drop the new models there (#217).
// Models with ids below related models are taken as fetched models with
// loaded relations, and are ignored.
function checkForInsertBelowRelateErrors(graphData, builder) {
  const { graph, graphOptions } = graphData;

  for (const node of graph.nodes) {
    if (graphOptions.shouldRelate(node, graphData)) {
      const newNode = node.descendantRelationNodes.find(
        (descendantNode) =>
          !descendantNode.hasId && graphOptions.shouldInsert(descendantNode, graphData),
      );

      if (newNode) {
        throw builder.modelClass().createValidationError({
          type: ValidationErrorType.InvalidGraph,
          message: `insertGraph cannot insert the new model at '${newNode.dataPathKey.substring(1)}' below a related model. Insert it with a separate query or use upsertGraph instead`,
        });
      }
    }
  }
}

function executeOperations(builder) {
  return (graphData) => {
    const operations = graphData.graphOptions.isInsertOnly()
      ? [new GraphInsert(graphData)]
      : [
          new GraphRelate(graphData),
          new GraphDelete(graphData, { belongsToOne: false }),
          new GraphInsert(graphData),
          new GraphPatch(graphData),
          new GraphDelete(graphData, { belongsToOne: true }),
          new GraphRecursiveUpsert(graphData),
        ];

    return operations.reduce((promise, operation) => {
      const actions = operation.createActions();

      return promise.then(() => executeActions(builder, actions));
    }, Promise.resolve());
  };
}

function executeActions(builder, actions) {
  return actions.reduce(
    (promise, action) => promise.then(() => action.run(builder)),
    Promise.resolve(),
  );
}

// The reference markers only describe the input graph, don't return them.
// `nodes` are the nodes before pruning, since the results of pruned branches
// contain markers too.
function removeReferenceProps(nodes) {
  return () => {
    for (const node of nodes) {
      delete node.obj[node.modelClass.uidRefProp];
      delete node.obj[node.modelClass.dbRefProp];
    }
  };
}

function isOnConflictOperation(op) {
  return op.name === 'onConflict' || op.name === 'ignore' || op.name === 'merge';
}

function returnResult(objects, isArray) {
  return () => (isArray ? objects : objects[0]);
}
