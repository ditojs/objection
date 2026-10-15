import { GraphNode, createNotModelError, formatPath } from './GraphNode.js';
import { GraphOptions } from './GraphOptions.js';
import { GraphPlan } from './GraphPlan.js';
import { GraphKeys, hasSameColumns, isOtherKey, readsWrittenValue } from './graphKeys.js';
import { GraphSchedule } from './GraphSchedule.js';
import { GraphWriter } from './GraphWriter.js';
import { getReadKeys, loadCurrentGraph } from './GraphLoader.js';
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
      if (node.parent && node.isDbReference) {
        node.relation.setRelateProp(node.obj, asArray(node.dbReference));
      }
    }

    // A `#ref` to a model with an id is that model, also when its relations
    // are loaded and upserted:
    for (const { obj, referencedNode } of nodes) {
      if (referencedNode?.obj.$hasId() && !obj.$hasId()) {
        obj.$id(referencedNode.obj.$id());
      }
    }

    try {
      checkGraph(builder, new GraphPlan({ nodes, graphOptions }));
      checkPlacements(builder, nodes);
      checkReferenceCycles(nodes);
      const plan = new GraphPlan({ nodes, graphOptions });
      const isUpsert = !graphOptions.isInsertOnly();
      const load = async (readKeys) => {
        if (isUpsert) {
          await loadCurrentGraph(builder, plan, readKeys);
        }

        plan.cacheDecisions();
        plan.prune().plan();
        return new GraphKeys(plan);
      };

      // The relations of rows whose keys change are read again at the keys that
      // the graph gives them, and the graph is planned with them:
      let keys = await load();
      const readKeys = isUpsert ? getReadKeys(plan, keys) : null;

      if (readKeys) {
        keys = await load(readKeys);
      }

      checkMissingModels(builder, plan);

      if (readKeys) {
        checkReadKeys(keys, readKeys);
      }

      checkChangedIds(builder, plan);
      // Models that `noInsert` or `noRelate` ignore aren't written, but the
      // ones marked with `#delete` or `#unrelate` keep their values:
      const writtenNodes = new Set(
        plan.activeNodes.filter(
          (node) => plan.actions.get(node) !== 'ignore' || node.toBeUnrelatedOrDeleted,
        ),
      );
      checkReferences(builder, plan, writtenNodes);
      checkJoinTables(builder, plan);
      await new GraphWriter(new GraphSchedule(plan, keys)).write(builder);
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

// The keys at which the relations of rows were read must not change once
// these relations are planned.
function checkReadKeys(keys, readKeys) {
  for (const [node, relationKeys] of readKeys) {
    for (const [relation, values] of relationKeys) {
      if (isOtherKey(keys.getReadProps(node, relation.ownerProp), values)) {
        throw node.modelClass.createValidationError({
          type: ValidationErrorType.InvalidGraph,
          message: `the keys of the ${node.modelClass.name} at ${formatPath(node.dataPathKey)} depend on the rows that the graph moves`,
        });
      }
    }
  }
}

// Check the models with ids that are neither at their place nor related, once
// the current graph is loaded.
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

// The graph writes keys of rows that can't change if they're part of the ids
// of the rows: the foreign key of a row that a HasMany or HasOne relate moves
// to another owner, and the foreign key of an existing row that its own
// BelongsToOne relate or insert points to another row, or that `null`,
// `#unrelate` or `#delete` clears. Keys that aren't known before the writes
// are compared only where they surely change, as new models get new keys.
function checkChangedIds(builder, plan) {
  const { actions } = plan;
  const newKey = {};
  const getKey = (node, prop, i) =>
    actions.get(node) === 'insert' && !node.obj.$hasId()
      ? newKey
      : (prop.getProp(node.obj, i) ?? (node.existing && prop.getProp(node.existing.obj, i)));

  const checkKey = (row, relation, rowProp, getNewKey) => {
    const idProps = row.modelClass.getIdPropertyArray();
    const isChanged =
      actions.get(row) !== 'insert' &&
      rowProp.props.some((prop, i) => {
        const key = row.obj[prop];
        const changedKey = getNewKey(i);
        return (
          idProps.includes(prop) &&
          key !== undefined &&
          changedKey !== undefined &&
          (changedKey === newKey || !nonStrictEquals(key, changedKey))
        );
      });

    if (isChanged) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `the graph changes the key of the ${row.modelClass.name} at ${formatPath(row.dataPathKey)} through ${relation.name}, which is part of its id`,
      });
    }
  };

  for (const node of plan.activeNodes) {
    const { relation, parent } = node;
    const action = actions.get(node);

    if (relation?.keySide === 'related' && action === 'relate') {
      checkKey(node.referencedNode || node, relation, relation.relatedProp, (i) =>
        getKey(parent, relation.ownerProp, i),
      );
    } else if (relation?.keySide === 'owner' && relation.isOneToOne()) {
      if (node.toBeUnrelatedOrDeleted) {
        if (node.current) {
          checkKey(parent, relation, relation.ownerProp, () => null);
        }
      } else if (action === 'relate' || action === 'insert') {
        checkKey(parent, relation, relation.ownerProp, (i) =>
          getKey(node.referencedNode || node, relation.relatedProp, i),
        );
      }
    }

    // `null` clears the key:
    const nullNames = node.modelClass.getRelationNames().filter((name) => node.obj[name] === null);

    for (const name of nullNames) {
      const nullRelation = node.modelClass.getRelation(name);

      if (nullRelation.keySide === 'owner' && nullRelation.isOneToOne()) {
        checkKey(node, nullRelation, nullRelation.ownerProp, () => null);
      }
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
  const rowTables = new Map();
  const rowRelations = new Map();
  const setValue = (rowId, name, prop, value, path) => {
    const values = rows.get(rowId) || new Map();
    const other = values.get(prop);
    rows.set(rowId, values);

    if (!other) {
      values.set(prop, { value, path });
    } else if (!nonStrictEquals(other.value, value)) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `the graph gives ${prop} of one ${name} two values, at ${formatPath(other.path)} and at ${formatPath(path)}`,
      });
    }
  };
  const setNodeValue = (node, prop, value, path) =>
    setValue(getRowId(node), node.modelClass.name, prop, value, path);

  // The join row of the pair of models that `node` and its parent are, the
  // same through both relations of the join table:
  const getJoinRowId = (node) =>
    [
      node.relation.joinTable,
      ...[
        [node.relation.joinTableOwnerProp.cols, getRowId(node.parent)],
        [node.relation.joinTableRelatedProp.cols, getRowId(node)],
      ]
        .sort(([cols1], [cols2]) => cols1.join().localeCompare(cols2.join()))
        .map(([cols, rowId]) => `${cols}=${rowId}`),
    ].join(':');

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
    rowTables.set(rowId, modelClass.getTableName());
    rowRelations.set(rowId, (rowRelations.get(rowId) || new Set()).add(relation));

    if (!node.toBeUnrelatedOrDeleted) {
      for (const prop of Object.keys(obj)) {
        if (obj[prop] !== undefined && !isInternalProp(prop) && !skippedProps.includes(prop)) {
          setNodeValue(node, prop, obj[prop], getPath(node, prop));
        }
      }
    }

    // A pair of models has one join row, which gets the extras of all places
    // of the pair:
    if (relation?.keySide === 'join' && !node.toBeUnrelatedOrDeleted) {
      for (const { aliasProp } of relation.joinTableExtras) {
        if (obj[aliasProp] !== undefined) {
          const path = getPath(node, aliasProp);
          setValue(
            getJoinRowId(node),
            `join row of ${relation.name}`,
            aliasProp,
            obj[aliasProp],
            path,
          );
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
      // A row that lists itself on the same column restates its own key:
      const isSelfLink =
        getRowId(node) === getRowId(parent) &&
        hasSameColumns(relation.relatedProp, relation.ownerProp);

      if (!isDeleted && !isSelfLink) {
        relation.relatedProp.forEach((i) => {
          const key = isUnrelated ? null : getKey(parent, relation.ownerProp, i);
          setNodeValue(node, relation.relatedProp.props[i], key, path);
        });
      }

      if (isSlot(relation)) {
        const row = node.toBeUnrelatedOrDeleted ? null : getRowId(node);
        slots.push({ owner: parent, relation, row, path });
      }
    } else if (relation && isOwnerKey(relation)) {
      relation.ownerProp.forEach((i) => {
        const key = node.toBeUnrelatedOrDeleted ? null : getKey(node, relation.relatedProp, i);
        setNodeValue(parent, relation.ownerProp.props[i], key, path);
      });
    }

    setNodeValue(node, '#delete', isDeleted, path);

    // All places of a pair of models keep or remove its join row:
    if (relation?.keySide === 'join') {
      const name = `join row of ${relation.name}`;
      setValue(getJoinRowId(node), name, '#unrelate', node.toBeUnrelatedOrDeleted, path);
    }

    // `null` clears the key or the slot:
    for (const nullRelation of getRelations(node).filter(({ name }) => node.obj[name] === null)) {
      if (isOwnerKey(nullRelation)) {
        nullRelation.ownerProp.forEach((i) => {
          setNodeValue(
            node,
            nullRelation.ownerProp.props[i],
            null,
            getPath(node, nullRelation.name),
          );
        });
      } else if (isSlot(nullRelation)) {
        const path = getPath(node, nullRelation.name);
        slots.push({ owner: node, relation: nullRelation, row: null, path });
      }
    }
  }

  // The rows of a table by the values that the graph gives the props of a key,
  // with the values that stand for keys as they are and the others as strings,
  // so that e.g. `1` and `'1'` are the same key:
  const toIndexKey = (values) =>
    JSON.stringify(values.map((value) => (isObject(value) ? value : String(value))));
  const indexes = new Map();
  const getRowsByKey = (table, props) => {
    const indexName = `${table}:${props.join()}`;
    let index = indexes.get(indexName);

    if (!index) {
      index = new Map();
      indexes.set(indexName, index);

      for (const [rowId, values] of rows) {
        const keyValues = props.map((prop) => values.get(prop)?.value);

        if (rowTables.get(rowId) === table && keyValues.every((value) => value != null)) {
          const indexKey = toIndexKey(keyValues);
          const rowIds = index.get(indexKey);

          if (rowIds) {
            rowIds.push(rowId);
          } else {
            index.set(indexKey, [rowId]);
          }
        }
      }
    }

    return index;
  };

  // Any other row that the graph gives the key of the owner of a slot is a
  // second row in it, unless the relation filters its rows and the graph
  // doesn't reach the row through it:
  for (const { owner, relation, row, path } of slots) {
    const { relatedModelClass, relatedProp, ownerProp } = relation;
    const ownerKey = ownerProp.props.map((_, i) => getKey(owner, ownerProp, i));
    const rowsByKey = getRowsByKey(relatedModelClass.getTableName(), relatedProp.props);
    const otherRowId = (rowsByKey.get(toIndexKey(ownerKey)) || []).find(
      (rowId) => rowId !== row && (!relation.modify || rowRelations.get(rowId).has(relation)),
    );

    if (otherRowId) {
      const other = rows.get(otherRowId).get(relatedProp.props[0]);
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `the graph puts two ${relatedModelClass.name} rows in ${relation.name} of one ${owner.modelClass.name}, at ${formatPath(path)} and at ${formatPath(other.path)}`,
      });
    }
  }
}

// References need the ids of the models they point to, which the database
// only gives the models that the graph writes. The ids of new models that the
// graph doesn't write, e.g. as `noInsert` skips them, are never known.
// Everything else reads the models as the graph gives them. The references of
// models that aren't written are never resolved.
function checkReferences(builder, plan, writtenNodes) {
  const isReadable = (node, refPath) =>
    writtenNodes.has(node) ||
    node.obj.$hasId() ||
    (!!refPath && !node.modelClass.getIdPropertyArray().includes(refPath[0]));

  for (const node of plan.activeNodes.filter((node) => writtenNodes.has(node))) {
    const { referencedNode, propertyReferences } = node;

    if (
      (referencedNode && !isReadable(referencedNode)) ||
      propertyReferences.some(({ referencedNode, refPath }) => !isReadable(referencedNode, refPath))
    ) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.InvalidGraph,
        message: `the reference at ${formatPath(node.dataPathKey)} points to a model that the graph doesn't write before it`,
      });
    }
  }
}

// A `#ref{}` waits for the model it reads if the value only exists once that
// model is written. These waits follow from the graph alone, so their cycles
// are found before the first write.
function checkReferenceCycles(nodes) {
  const getWaitedNodes = (node) =>
    node.propertyReferences
      .filter((reference) => reference.referencedNode !== node && readsWrittenValue(reference))
      .map(({ referencedNode }) => referencedNode);
  const visitingNodes = new Set();
  const visitedNodes = new Set();

  const visit = (node) => {
    if (visitingNodes.has(node)) {
      throw new Error('the object graph contains cyclic references');
    } else if (!visitedNodes.has(node)) {
      visitingNodes.add(node);
      getWaitedNodes(node).forEach(visit);
      visitingNodes.delete(node);
      visitedNodes.add(node);
    }
  };

  nodes.forEach(visit);
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
