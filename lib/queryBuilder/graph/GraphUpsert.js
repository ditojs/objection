import { GraphNode, createNotModelError } from './GraphNode.js';
import { GraphOptions } from './GraphOptions.js';
import { GraphPlan } from './GraphPlan.js';
import { GraphWriter } from './GraphWriter.js';
import { loadCurrentGraph } from './GraphLoader.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { RelationExpression } from '../RelationExpression.js';
import { asArray, isObject, nonStrictEquals } from '../../utils/objectUtils.js';
import { isInternalProp } from '../../utils/internalPropUtils.js';

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
    const nodes = GraphNode.buildGraph(builder.modelClass(), this.roots);
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

    try {
      checkGraph(builder, new GraphPlan({ nodes, graphOptions }));
      checkPlacements(builder, nodes);
      const writtenNodes = new Set();
      let keptNodes = new Map();

      // Rows that the graph relates into a HasManyRelation or HasOneRelation
      // and gives relations are moved first, and their relations are upserted
      // in another pass, against their rows as they are after the move (#214).
      for (let passNodes = nodes; passNodes.length > 0;) {
        const plan = new GraphPlan({
          nodes: passNodes,
          graphOptions,
          keptNodes,
        });
        const movedNodes = graphOptions.isInsertOnly() ? [] : await loadCurrentGraph(builder, plan);

        plan.defer(movedNodes.flatMap((node) => node.descendants));
        plan.cacheDecisions();
        checkMissingModels(builder, plan);
        plan.prune().plan();
        // The rows that this pass keeps stay kept in the next ones, as decided
        // before its writes:
        keptNodes = plan.keptNodes;
        checkReferences(builder, plan, writtenNodes);
        checkJoinTables(builder, plan);
        await new GraphWriter(plan).write(builder);

        for (const node of plan.activeNodes) {
          writtenNodes.add(node);
        }

        passNodes = movedNodes.flatMap((node) => [node, ...node.descendants]);
      }
    } catch (err) {
      // The input can be retried as it was:
      restoreMarkers();
      throw err;
    }

    return this.roots;
  }

  get roots() {
    return this.isArray ? this.objects : this.objects[0];
  }
}

// Check the models with ids that are neither at their place nor related, once
// the current graph of a pass is loaded.
function checkMissingModels(builder, plan) {
  for (const node of plan.nodes) {
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
}

// Check the whole graph before anything is written.
function checkGraph(builder, plan) {
  const { nodes, graphOptions } = plan;
  const modelClass = builder.modelClass();
  const createInvalidGraphError = (message) =>
    modelClass.createValidationError({ type: ValidationErrorType.InvalidGraph, message });

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
          `insertGraph cannot insert the new model at ${formatPath(newNode.dataPathKey)} below a related model. Insert it with a separate query or use upsertGraph instead`,
        );
      }
    }
  }
}

// One row can't get two values for one column, and the slot of a
// HasOneRelation can't get two rows. A `#ref` or `#dbRef` model is a place of
// the row that it refers to. The keys that relations give a row are the values
// of the key props across them, or stand for these where the graph doesn't
// give them, e.g. for new models.
function checkPlacements(builder, nodes) {
  const newRowIds = new Map();
  const getRowId = (node) => {
    const target = node.referencedNode || node;

    if (target.obj.$hasId()) {
      return target.rowKey;
    } else {
      if (!newRowIds.has(target)) {
        newRowIds.set(target, `new:${newRowIds.size}`);
      }

      return newRowIds.get(target);
    }
  };

  // The values that the graph gives each row, by prop, and the model classes
  // and relations through which the graph reaches the rows:
  const rows = new Map();
  const rowClasses = new Map();
  const rowRelations = new Map();
  const setValue = (node, prop, value, path) => {
    const rowId = getRowId(node);
    const values = rows.get(rowId) || new Map();
    const other = values.get(prop);
    rows.set(rowId, values);

    if (!other) {
      values.set(prop, { value, path });
    } else if (!nonStrictEquals(other.value, value)) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `the graph gives ${prop} of one ${node.modelClass.name} two values, at ${formatPath(other.path)} and at ${formatPath(path)}`,
      });
    }
  };

  const getPath = (node, ...keys) => [node.dataPathKey, ...keys].filter(Boolean).join('.');
  const getRelations = (node) =>
    node.modelClass
      .getRelationNames()
      .filter((name) => node.obj[name] !== undefined)
      .map((name) => node.modelClass.getRelation(name));
  const isOwnerKey = (relation) => relation.keySide === 'owner' && relation.isOneToOne();
  const isSlot = (relation) => relation.keySide === 'related' && relation.isOneToOne();

  // The props that the models give, except for the ids and the keys that the
  // relations of the same model set, which follow these relations:
  for (const node of nodes) {
    const { modelClass, obj, relation } = node;
    const skippedProps = [
      ...modelClass.getRelationNames(),
      ...modelClass.getIdPropertyArray(),
      ...(relation?.keySide === 'related' ? relation.relatedProp.props : []),
      // The extras of join rows belong to the join rows:
      ...(relation?.keySide === 'join' ? relation.joinTableExtras.map((e) => e.aliasProp) : []),
      ...getRelations(node)
        .filter(isOwnerKey)
        .flatMap((relation) => relation.ownerProp.props),
    ];

    const rowId = getRowId(node);
    rowClasses.set(rowId, modelClass);
    rowRelations.set(rowId, (rowRelations.get(rowId) || new Set()).add(relation));

    if (!node.toBeUnrelatedOrDeleted) {
      for (const prop of Object.keys(obj)) {
        if (obj[prop] !== undefined && !isInternalProp(prop) && !skippedProps.includes(prop)) {
          setValue(node, prop, obj[prop], getPath(node, prop));
        }
      }
    }
  }

  // The value of the key prop `i` of `prop` that `node` gives across a
  // relation, from wherever the graph gives the row, or one that stands for it:
  const getKey = (node, prop, i) =>
    prop.getProp(node.obj, i) ??
    rows.get(getRowId(node))?.get(prop.props[i])?.value ?? {
      row: getRowId(node),
      prop: prop.props[i],
    };

  // The keys that the relations give the rows, the rows that the graph puts
  // in the slots of HasOneRelations, and whether the rows are deleted:
  const slots = [];
  for (const node of nodes) {
    const { relation, parent } = node;
    const path = getPath(node);
    const isUnrelated = node.toBeUnrelated;
    const isDeleted = node.toBeDeleted && !isUnrelated;

    if (relation?.keySide === 'related') {
      if (!isDeleted) {
        relation.relatedProp.forEach((i) => {
          const key = isUnrelated ? null : getKey(parent, relation.ownerProp, i);
          setValue(node, relation.relatedProp.props[i], key, path);
        });
      }

      if (isSlot(relation)) {
        const row = node.toBeUnrelatedOrDeleted ? null : getRowId(node);
        slots.push({ owner: parent, relation, row, path });
      }
    } else if (relation && isOwnerKey(relation)) {
      relation.ownerProp.forEach((i) => {
        const key = node.toBeUnrelatedOrDeleted ? null : getKey(node, relation.relatedProp, i);
        setValue(parent, relation.ownerProp.props[i], key, path);
      });
    }

    setValue(node, '#delete', isDeleted, path);

    // `null` clears the key or the slot:
    for (const nullRelation of getRelations(node).filter(({ name }) => node.obj[name] === null)) {
      if (isOwnerKey(nullRelation)) {
        nullRelation.ownerProp.forEach((i) => {
          setValue(node, nullRelation.ownerProp.props[i], null, getPath(node, nullRelation.name));
        });
      } else if (isSlot(nullRelation)) {
        const path = getPath(node, nullRelation.name);
        slots.push({ owner: node, relation: nullRelation, row: null, path });
      }
    }
  }

  // Any other row that the graph gives the key of the owner of a slot is a
  // second row in it, unless the relation filters its rows and the graph
  // doesn't reach the row through it:
  for (const { owner, relation, row, path } of slots) {
    const { relatedModelClass, relatedProp, ownerProp } = relation;
    const ownerKey = ownerProp.props.map((_, i) => getKey(owner, ownerProp, i));

    for (const [rowId, values] of rows) {
      const isInSlot =
        rowId !== row &&
        rowClasses.get(rowId).getTableName() === relatedModelClass.getTableName() &&
        (!relation.modify || rowRelations.get(rowId).has(relation)) &&
        relatedProp.props.every((prop, i) => {
          const key = values.get(prop);
          return key && nonStrictEquals(key.value, ownerKey[i]);
        });

      if (isInSlot) {
        const other = values.get(relatedProp.props[0]);
        throw builder.modelClass().createValidationError({
          type: ValidationErrorType.InvalidGraph,
          message: `the graph puts two ${relatedModelClass.name} rows in ${relation.name} of one ${owner.modelClass.name}, at ${formatPath(path)} and at ${formatPath(other.path)}`,
        });
      }
    }
  }
}

// References need the models they point to written in the same pass or an
// earlier one, except for a `#ref` to a model with an id, which is all it
// needs. Models in branches that the graph doesn't write are never written.
function checkReferences(builder, plan, writtenNodes) {
  const activeNodes = new Set(plan.activeNodes);
  const isWritten = (node) => activeNodes.has(node) || writtenNodes.has(node);

  for (const node of plan.activeNodes) {
    const { referencedNode, propertyReferences } = node;

    if (
      (referencedNode && !isWritten(referencedNode) && !referencedNode.obj.$hasId()) ||
      propertyReferences.some((reference) => !isWritten(reference.referencedNode))
    ) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `the reference at ${formatPath(node.dataPathKey)} points to a model that the graph doesn't write before it`,
      });
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

// Name the place of a model in error messages, by its data path.
function formatPath(dataPathKey) {
  const path = dataPathKey.replace(/^\./, '');
  return path ? `'${path}'` : 'the root';
}

function isOnConflictOperation(operation) {
  return ['onConflict', 'ignore', 'merge'].includes(operation.name);
}
