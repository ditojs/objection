import { GraphNode, createNotModelError } from './GraphNode.js';
import { GraphOptions } from './GraphOptions.js';
import { GraphPlan } from './GraphPlan.js';
import { GraphWriter } from './GraphWriter.js';
import { loadCurrentGraph } from './GraphLoader.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { RelationExpression } from '../RelationExpression.js';
import { asArray, isObject } from '../../utils/objectUtils.js';

export class GraphUpsert {
  constructor({ rootModelClass, objects, upsertOptions, insertOnly = false }) {
    // Wrap `undefined` too, so that it fails the check:
    for (const obj of Array.isArray(objects) ? objects : [objects]) {
      if (!isObject(obj)) {
        throw createNotModelError(rootModelClass, obj);
      }
    }

    this.objects = rootModelClass.ensureModelArray(objects, GraphUpsert.modelOptions);
    this.isArray = Array.isArray(objects);
    this.graphOptions = new GraphOptions(upsertOptions, insertOnly);
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

  async run(builder) {
    const { graphOptions } = this;
    const nodes = GraphNode.buildGraph(builder.modelClass(), this.objects);
    GraphNode.linkReferences(nodes);
    const restoreMarkers = GraphNode.removeMarkers(nodes);

    for (const node of nodes) {
      const { referencedNode } = node;

      if (node.parent && node.isDbReference) {
        node.relation.setRelateProp(node.obj, asArray(node.dbReference));
      } else if (referencedNode?.obj.$hasId() && !node.obj.$hasId()) {
        // A `#ref` to an existing model is that model, also when its relations
        // are loaded and upserted:
        node.obj.$id(referencedNode.obj.$id());
      }
    }

    const plan = new GraphPlan({ nodes, graphOptions });

    try {
      if (!graphOptions.isInsertOnly()) {
        await loadCurrentGraph(builder, plan);
      }

      plan.cacheDecisions();
      checkGraph(builder, plan);
      plan.prune().plan();
      checkJoinTables(builder, plan);
      await new GraphWriter(plan).write(builder);
    } catch (err) {
      // Put the markers back into the input. The ids and keys that the writes
      // gave it stay:
      restoreMarkers();
      throw err;
    }

    return this.isArray ? this.objects : this.objects[0];
  }
}

function checkGraph(builder, plan) {
  const { nodes, graphOptions } = plan;
  const modelClass = builder.modelClass();
  const createInvalidGraphError = (message) =>
    modelClass.createValidationError({ type: ValidationErrorType.InvalidGraph, message });

  for (const node of nodes) {
    if (plan.intentFor(node) === 'missing') {
      const id = node.obj.$id();

      throw node.modelClass.createNotFoundError(builder.context(), {
        message: node.isMissing
          ? `model (id=${id}) does not exist. If you want to insert it with an id, use the insertMissing option`
          : node.isRoot
            ? `root model (id=${id}) does not exist. If you want to insert it with an id, use the insertMissing option`
            : `model (id=${id}) is not a child of model (id=${node.parent.obj.$id()}). If you want to relate it, use the relate option. If you want to insert it with an id, use the insertMissing option`,
        dataPath: node.dataPath,
      });
    }
  }

  const allowedExpression = builder.allowedGraphExpression();
  const rootObjs = nodes.filter((node) => node.isRoot).map((node) => node.obj);

  if (
    allowedExpression &&
    !allowedExpression.isSubExpression(RelationExpression.fromModelGraph(rootObjs))
  ) {
    throw modelClass.createValidationError({
      type: ValidationErrorType.UnallowedRelation,
      message: 'trying to upsert an unallowed relation',
    });
  }

  if (
    !graphOptions.allowRefs() &&
    nodes.some((node) => node.isReference || node.propertyReferences.length > 0)
  ) {
    throw createInvalidGraphError(
      '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
    );
  }

  // `#unrelate` and `#delete` markers come from the graph data, which may be
  // untrusted input. Like `#ref`, they have to be allowed explicitly (#2410).
  // Root models can't be marked even with `allowMarkers`, so report that first.
  // An insert has nothing to unrelate or delete, so `insertGraph` rejects them.
  const markedNode = nodes.find((node) => node.toBeUnrelatedOrDeleted);

  if (markedNode) {
    const { graphUnrelateProp, graphDeleteProp } = markedNode.modelClass;
    const markers = `${graphUnrelateProp} and ${graphDeleteProp}`;

    if (nodes.some((node) => node.isRoot && node.toBeUnrelatedOrDeleted)) {
      throw createInvalidGraphError(
        `${markers} can only be used for related models, not for root models`,
      );
    } else if (!graphOptions.allowMarkers()) {
      throw createInvalidGraphError(
        graphOptions.isInsertOnly()
          ? `${markers} can only be used in upsertGraph, not in insertGraph`
          : `${markers} markers are not allowed in a graph by default. see the allowMarkers upsertGraph option`,
      );
    }
  }

  if (graphOptions.isInsertOnly()) {
    const relatedNodes = nodes.filter((node) => plan.actionFor(node) === 'relate');

    if (relatedNodes.some((node) => node.relation.keySide === 'related')) {
      throw new Error(
        'You cannot relate HasManyRelation or HasOneRelation using insertGraph, because those require update operations. Consider using upsertGraph instead.',
      );
    }

    // `upsertGraph()` upserts the branches below related models, but
    // `insertGraph()` leaves them out, which would drop the new models there
    // (#217). Models with ids below related models are taken as fetched models
    // with loaded relations, and are ignored.
    for (const node of relatedNodes) {
      const newNode = node.descendants.find(
        (descendant) => !descendant.hasId && plan.actionFor(descendant) === 'insert',
      );

      if (newNode) {
        throw createInvalidGraphError(
          `insertGraph cannot insert the new model at '${newNode.dataPathKey.substring(1)}' below a related model. Insert it with a separate query or use upsertGraph instead`,
        );
      }
    }
  }
}

// Inserting or relating a model of a many-to-many relation inserts a join row,
// which would be a new related row if the join table is also the related table
// (#133).
function checkJoinTables(builder, plan) {
  for (const node of plan.activeNodes) {
    const action = plan.actions.get(node);

    if (
      node.relation?.keySide === 'join' &&
      !node.current &&
      (action === 'insert' || action === 'relate')
    ) {
      node.relation.assertCanModifyJoinTable(builder, action);
    }
  }
}

function isOnConflictOperation(operation) {
  return ['onConflict', 'ignore', 'merge'].includes(operation.name);
}
