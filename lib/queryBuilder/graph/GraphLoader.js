import { asArray, chunk, groupBy, nonStrictEquals } from '../../utils/objectUtils.js';
import { getMaxRows } from '../../utils/knexUtils.js';
import { FetchStrategy } from './GraphOptions.js';
import { GraphNode } from './GraphNode.js';
import { hasSameKey } from './GraphPlan.js';
import { RelationExpression } from '../RelationExpression.js';
import { getDeclaredColumns } from '../operations/fieldExpressions.js';
import { getFieldExpressionColumn } from '../../utils/parseFieldExpression.js';

// Fetch the current state of the graph from the database and pair its rows with
// the models of the graph: First the roots with their relations, then the rows
// of the models that the graph relates from elsewhere, with the relations that
// the graph gives them, level by level, as the rows of related models decide
// which models below them are related too. Models that `insertMissing` inserts
// if they don't exist are looked up too. The rows whose keys the graph changes,
// by moving them or by leaving them out of a relation, read the relations that
// are keyed on these keys as they are after the writes, see `fetchStandIns()`.
export async function loadCurrentGraph(builder, plan) {
  const nodeSet = new Set(plan.nodes);
  const fetchedNodes = new Set();

  const fetch = async (nodes, { areRelated }) => {
    for (const node of nodes) {
      fetchedNodes.add(node);
    }

    for (const nodesOfClass of groupBy(nodes, (node) => node.modelClass).values()) {
      const models = await fetchModels(builder, plan.graphOptions, nodesOfClass, {
        withRelations: true,
      });
      const modelsByKey = new Map(models.map((model) => [model.$idKey(), model]));

      for (const node of nodesOfClass) {
        const model = modelsByKey.get(node.obj.$idKey());

        if (model) {
          const currentNodes = GraphNode.buildGraph(node.modelClass, model, node.relationPath);
          const [currentNode] = currentNodes;
          plan.currentNodes.push(...currentNodes);

          if (areRelated) {
            node.row = currentNode;
            currentNode.node = node;
            pairChildren(node, currentNode);
          } else {
            pair(node, currentNode);
          }
        } else if (areRelated) {
          node.isMissing = true;
        }
      }
    }
  };

  // Find the models that the graph relates and that aren't fetched yet, for
  // which `isFetched(node, rowKeys)` is true. The ones below others wait for
  // their rows, and the ones in branches that the graph doesn't write are left
  // out.
  const findRelatedNodes = (isFetched) => {
    const rowKeys = new Set(plan.currentNodes.map((currentNode) => currentNode.rowKey));
    const nodes = plan.nodes.filter(
      (node) =>
        !fetchedNodes.has(node) &&
        !node.current &&
        node.obj.$hasId() &&
        plan.actionFor(node) === 'relate' &&
        isFetched(node, rowKeys),
    );
    const relatedNodeSet = new Set(nodes);

    return nodes.filter((node) => {
      for (let parent = node.parent; nodeSet.has(parent); parent = parent.parent) {
        if (relatedNodeSet.has(parent) || !plan.writesBranchOf(parent)) {
          return false;
        }
      }

      return true;
    });
  };

  await fetch(
    plan.nodes.filter((node) => !node.parent && node.hasId),
    { areRelated: false },
  );

  // The rows of the related models that the graph gives relations, or inserts
  // with `insertMissing` if they don't exist. Stand-ins replace rows below them,
  // and the models of these rows that the graph relates then need theirs:
  const hasRelatedRow = (node, rowKeys) =>
    hasRelations(node.obj) ||
    (plan.graphOptions.has(node, 'insertMissing') && !rowKeys.has(node.rowKey));

  const standInRows = new Set();

  for (
    let isChanged = true;
    isChanged;
    isChanged = await fetchStandIns(builder, plan, standInRows)
  ) {
    for (
      let nodes = findRelatedNodes(hasRelatedRow);
      nodes.length > 0;
      nodes = findRelatedNodes(hasRelatedRow)
    ) {
      await fetch(nodes, { areRelated: true });
    }
  }

  // The other related models only need to exist, except for `#ref` models,
  // which are the models that they refer to, and the rows of the current graph
  // (#372):
  const nodes = findRelatedNodes((node, rowKeys) => !node.isReference && !rowKeys.has(node.rowKey));

  for (const nodesOfClass of groupBy(nodes, (node) => node.modelClass).values()) {
    const models = await fetchModels(builder, plan.graphOptions, nodesOfClass, {
      onlyIds: true,
    });
    const idKeys = new Set(models.map((model) => model.$idKey()));

    for (const node of nodesOfClass) {
      node.isMissing = !idKeys.has(node.obj.$idKey());
    }
  }

  // A place that puts a row where the first place that relates it moves it, in
  // a relation with the same key, e.g. a later place in the same relation of
  // the same owner, or the row's own `siblings`, is a current row there, as its
  // relations were read before the move. `#ref` places don't write their rows,
  // their models do:
  const finalKeys = getFinalKeys(plan);
  const movers = new Map();

  for (const node of plan.nodes) {
    if (!node.isReference && node.obj.$hasId()) {
      const mover = movers.get(node.rowKey);

      if (!mover && node.row) {
        movers.set(node.rowKey, node);
      } else if (
        mover &&
        !node.current &&
        hasSameKey(mover.relation, node.relation) &&
        node.relation.relatedProp.props.every((_, i) => {
          const key = getOwnerKey(finalKeys, node, i);
          return (
            key !== undefined &&
            nonStrictEquals(key, node.relation.relatedProp.getProp(mover.row.obj, i))
          );
        })
      ) {
        node.current = mover.row;
      }
    }
  }
}

// Replace the current rows whose keys the graph changes with stand-ins: copies
// with their final keys, which read the relations that the graph gives them and
// that are keyed on these keys as they are after the writes, batched by model
// class. The writes bind the relations of these rows to their final keys too.
// Keys of new owners are unknown until they're inserted: The stand-ins read at
// `null`, as new owners hold no rows yet, and leave these keys out.
// Return true if any rows were replaced.
async function fetchStandIns(builder, plan, standInRows) {
  const finalKeys = getFinalKeys(plan);
  const standIns = [];

  for (const node of plan.nodes) {
    const current = node.current ?? node.row;
    const rowKeys = current && finalKeys.get(node.rowKey);

    if (rowKeys) {
      // The keys that change, where keys that the row wasn't fetched with
      // count as changed, and the relations that the graph gives the row and
      // that are keyed on them:
      const keys = [...rowKeys.values()].filter(({ prop, index, value }) => {
        const currentValue = prop.getProp(current.obj, index);
        return value === undefined
          ? !standInRows.has(current)
          : currentValue === undefined || !nonStrictEquals(currentValue, value);
      });
      const descriptions = new Set(keys.map(({ prop, index }) => prop.propDescription(index)));
      const names = node.modelClass.getRelationNames().filter((name) => {
        const { ownerProp } = node.modelClass.getRelation(name);
        return (
          node.obj[name] !== undefined &&
          ownerProp.props.some((_, i) => descriptions.has(ownerProp.propDescription(i)))
        );
      });

      if (names.length > 0) {
        const model = current.obj.$clone();

        for (const { prop, index, value } of keys) {
          prop.setProp(model, index, value ?? null);
        }

        standIns.push({ node, current, model, names, keys });
      }
    }
  }

  for (const standInsOfClass of groupBy(standIns, ({ node }) => node.modelClass).values()) {
    await fetchStandInsOfClass(builder, plan.graphOptions, standInsOfClass);
  }

  for (const { node, current, model, keys } of standIns) {
    for (const { prop, index, value } of keys) {
      if (value === undefined) {
        prop.setProp(model, index, undefined);
      }
    }

    standInRows.add(replaceCurrentNode(plan, node, current, model));
  }

  return standIns.length > 0;
}

async function fetchStandInsOfClass(builder, graphOptions, standIns) {
  const [{ node }] = standIns;
  const { modelClass } = node;
  const graphs = standIns.map(({ node, names }) =>
    Object.assign(
      Object.create(Object.getPrototypeOf(node.obj)),
      Object.fromEntries(names.map((name) => [name, node.obj[name]])),
    ),
  );
  const expression = RelationExpression.fromModelGraph(graphs);
  const ownerProps = expression.node.$childNames.map(
    (name) => modelClass.getRelation(name).ownerProp,
  );

  // The rows may have been fetched without the keys that these relations join
  // through, as the fetches only select the columns that the graph gives:
  const missingStandIns = standIns.filter(({ model }) =>
    ownerProps.some((prop) => prop.getProps(model).some((value) => value === undefined)),
  );

  if (missingStandIns.length > 0) {
    const columns = new Set([
      ...modelClass.getIdColumnArray(),
      ...ownerProps.flatMap((prop) => prop.cols),
    ]);
    const rows = await modelClass
      .query()
      .childQueryOf(builder, { fork: true, isInternalQuery: true })
      .findByIds(missingStandIns.map(({ model }) => model.$id()))
      .select([...columns]);
    const rowsByKey = new Map(rows.map((row) => [row.$idKey(), row]));

    for (const { model } of missingStandIns) {
      const row = rowsByKey.get(model.$idKey());

      for (const prop of ownerProps) {
        prop.forEach((i) => {
          if (prop.getProp(model, i) === undefined) {
            prop.setProp(model, i, prop.getProp(row, i));
          }
        });
      }
    }
  }

  await modelClass
    .fetchGraph(
      standIns.map(({ model }) => model),
      expression,
    )
    .childQueryOf(builder, { fork: true, isInternalQuery: true })
    .modify((fetchBuilder) => {
      lockLikeUpsert(builder, fetchBuilder);

      const nodes = standIns.map(({ node }) => node);

      for (const [relationPath, pathNodes] of getNodesByRelationPath(nodes, expression)) {
        if (relationPath) {
          fetchBuilder.modifyGraph(relationPath, createSelect(pathNodes, graphOptions, false));
        }
      }
    })
    .internalOptions({ keepImplicitJoinProps: true });
}

// The final values of the key columns that the graph changes, by row and
// column: The keys that its places set for the rows that they move into a
// HasManyRelation or HasOneRelation, and `null` for the rows that it leaves out
// of such a relation and keeps elsewhere without setting the key again
// (implicit clears). Rows below removed rows aren't written, and rows below
// owners whose keys change were read at the old keys, so they aren't left out
// at the final ones.
function getFinalKeys(plan) {
  // The decisions don't change while we read them, so we cache them for that:
  plan.cacheDecisions();
  const placedNodes = plan.nodes.filter(
    (node) =>
      node.relation?.keySide === 'related' &&
      node.obj.$hasId() &&
      !node.toBeUnrelatedOrDeleted &&
      // A row below itself, e.g. in its own `siblings`, restates its own key:
      node.parent.rowKey !== node.rowKey,
  );
  let clearedNodes = plan.currentNodes.filter(
    (currentNode) =>
      currentNode.relation?.keySide === 'related' &&
      !currentNode.node &&
      !!currentNode.parent.node &&
      plan.keptNodeForRow(currentNode) &&
      plan.actionForCurrent(currentNode) === 'unrelate',
  );
  let finalKeys;

  for (let isChanged = true; isChanged;) {
    finalKeys = solveFinalKeys(placedNodes, clearedNodes);
    const nodes = clearedNodes.filter(({ parent, relation: { ownerProp } }) =>
      ownerProp.props.every((_, i) => {
        const finalKey = getFinalKey(finalKeys, parent.rowKey, ownerProp, i);
        return (
          !finalKey || nonStrictEquals(ownerProp.getProp(parent.obj, i) ?? null, finalKey.value)
        );
      }),
    );
    isChanged = nodes.length < clearedNodes.length;
    clearedNodes = nodes;
  }

  plan.clearDecisions();
  return finalKeys;
}

// Placements beat clears. A placement takes the key of its owner, which is
// final right away unless the graph places the owner too, e.g. in chains of
// `siblings`. Then it waits for the owner's final key. The first known key that
// a row gets wins, as places that give a row different keys are rejected later.
// Keys of new owners are only known once they're inserted.
function solveFinalKeys(placedNodes, clearedNodes) {
  const finalKeys = new Map();
  const getDescription = (rowKey, prop, index) => `${rowKey} ${prop.propDescription(index)}`;
  const placedKeys = new Set(
    placedNodes.flatMap(({ rowKey, relation: { relatedProp } }) =>
      relatedProp.props.map((_, i) => getDescription(rowKey, relatedProp, i)),
    ),
  );
  const setKey = (rowKey, prop, index, value) => {
    const rowKeys = finalKeys.get(rowKey) || new Map();
    const description = prop.propDescription(index);

    if (rowKeys.get(description)?.value === undefined) {
      rowKeys.set(description, { prop, index, value });
      finalKeys.set(rowKey, rowKeys);
    }
  };

  for (const { rowKey, relation } of clearedNodes) {
    relation.relatedProp.forEach((i) => {
      if (!placedKeys.has(getDescription(rowKey, relation.relatedProp, i))) {
        setKey(rowKey, relation.relatedProp, i, null);
      }
    });
  }

  let placements = placedNodes.flatMap((node) =>
    node.relation.relatedProp.props.map((_, index) => ({ node, index })),
  );

  for (let count = 0; count !== placements.length;) {
    count = placements.length;
    placements = placements.filter(({ node, index }) => {
      const { parent, relation } = node;
      const isWaiting =
        placedKeys.has(getDescription(parent.rowKey, relation.ownerProp, index)) &&
        !getFinalKey(finalKeys, parent.rowKey, relation.ownerProp, index);

      if (!isWaiting) {
        setKey(node.rowKey, relation.relatedProp, index, getOwnerKey(finalKeys, node, index));
      }

      return isWaiting;
    });
  }

  return finalKeys;
}

// The key that the place of `node` gives its row, from its owner: its final key
// if the graph changes it, or what the owner's model or row holds, and
// `undefined` for new owners, whose keys are unknown until they're inserted.
function getOwnerKey(finalKeys, node, index) {
  const { parent, relation } = node;
  const { ownerProp } = relation;
  const finalKey = getFinalKey(finalKeys, parent.rowKey, ownerProp, index);
  return finalKey
    ? finalKey.value
    : (ownerProp.getProp(parent.obj, index) ??
        (parent.existing ? ownerProp.getProp(parent.existing.obj, index) : undefined));
}

function getFinalKey(finalKeys, rowKey, prop, index) {
  return finalKeys.get(rowKey)?.get(prop.propDescription(index));
}

// Replace the current node of `node` with one built from `model`, which a
// stand-in fetched, pair the models below `node` with it, and return it.
function replaceCurrentNode(plan, node, current, model) {
  const oldNodes = new Set([current, ...current.descendants]);
  const isRow = node.row === current;
  const newNodes = GraphNode.buildGraph(node.modelClass, model, current.relationPath);
  const [newCurrent] = newNodes;

  if (current.parent) {
    Object.assign(newCurrent, {
      parent: current.parent,
      relation: current.relation,
      index: current.index,
    });
    current.parent.children.splice(current.parent.children.indexOf(current), 1, newCurrent);
  }

  plan.currentNodes = [...plan.currentNodes.filter((other) => !oldNodes.has(other)), ...newNodes];

  for (const other of [node, ...node.descendants]) {
    if (oldNodes.has(other.current)) other.current = null;
    if (oldNodes.has(other.row)) other.row = null;
  }

  if (isRow) {
    node.row = newCurrent;
  } else {
    node.current = newCurrent;
  }

  newCurrent.node = node;
  pairChildren(node, newCurrent);
  return newCurrent;
}

function pair(node, currentNode) {
  node.current ??= currentNode;
  currentNode.node = node;
  pairChildren(node, currentNode);
}

// Pair the related models with ids with the current rows in the same relations.
// Rows can be related more than once through duplicate join rows, and all of
// them pair with the same model.
function pairChildren(node, currentNode) {
  const childrenByRelation = groupBy(currentNode.children, (child) => child.relation.name);

  for (const child of node.children) {
    if (child.obj.$hasId()) {
      const key = child.obj.$idKey();

      for (const currentChild of childrenByRelation.get(child.relation.name) || []) {
        if (currentChild.obj.$idKey() === key) {
          pair(child, currentChild);
        }
      }
    }
  }
}

function hasRelations(obj) {
  return obj.constructor.getRelationNames().some((name) => obj[name] !== undefined);
}

// Fetch the rows of `nodes`, with their relations or only their ids, in as many
// queries as the number of their ids requires.
async function fetchModels(builder, graphOptions, nodes, options) {
  const [{ modelClass }] = nodes;
  const nodesByKey = groupBy(nodes, (node) => node.obj.$idKey());
  const maxIds = getMaxRows(builder.unsafeKnex(), modelClass.getIdColumnArray().length);
  const models = [];

  // Fetch each row once, with the relations of all its places:
  for (const chunkNodes of chunk([...nodesByKey.values()], maxIds)) {
    models.push(...(await fetchModelsOfNodes(builder, graphOptions, chunkNodes, options)));
  }

  return models;
}

function fetchModelsOfNodes(
  builder,
  graphOptions,
  nodesByRow,
  { withRelations = false, onlyIds = false },
) {
  const [[{ modelClass }]] = nodesByRow;
  const ids = nodesByRow.map(([node]) => node.obj.$id());
  const nodes = nodesByRow.flat();
  const expression = RelationExpression.fromModelGraph(
    withRelations ? nodes.map((node) => node.obj) : [],
  );

  return modelClass
    .query()
    .childQueryOf(builder, { fork: true, isInternalQuery: true })
    .modify((fetchBuilder) => lockLikeUpsert(builder, fetchBuilder))
    .modify((fetchBuilder) => {
      const nodesByRelationPath = withRelations
        ? getNodesByRelationPath(nodes, expression)
        : new Map([['', nodes]]);

      for (const [relationPath, pathNodes] of nodesByRelationPath) {
        const select = onlyIds
          ? (builder) => builder.select(builder.fullIdColumn())
          : createSelect(pathNodes, graphOptions, !relationPath);

        if (!relationPath) {
          fetchBuilder.modify(select);
        } else {
          fetchBuilder.modifyGraph(relationPath, select);
        }
      }
    })
    .findByIds(ids)
    .withGraphFetched(expression)
    .internalOptions({ keepImplicitJoinProps: true });
}

// Group the fetched nodes and their descendants by their relation paths below
// the fetched nodes. Relations with nulls or empty arrays have no nodes, but
// are fetched too.
function getNodesByRelationPath(nodes, expression) {
  const nodesByRelationPath = new Map();

  for (const node of nodes) {
    const depth = node.relationPath.length;

    for (const descendant of [node, ...node.descendants]) {
      const relationPath = descendant.relationPath.slice(depth).join('.');
      const pathNodes = nodesByRelationPath.get(relationPath);

      if (pathNodes) {
        pathNodes.push(descendant);
      } else {
        nodesByRelationPath.set(relationPath, [descendant]);
      }
    }
  }

  const addPaths = (expressionNode, path) => {
    for (const name of expressionNode.$childNames) {
      const relationPath = [...path, name];
      const key = relationPath.join('.');

      if (!nodesByRelationPath.has(key)) {
        nodesByRelationPath.set(key, []);
      }

      addPaths(expressionNode[name], relationPath);
    }
  };

  addPaths(expression.node, []);
  return nodesByRelationPath;
}

function createSelect(nodes, graphOptions, isFetchRoot) {
  if (graphOptions.isFetchStrategy(FetchStrategy.OnlyIdentifiers)) {
    return (builder) => builder.select(builder.fullIdColumn());
  } else if (graphOptions.isFetchStrategy(FetchStrategy.OnlyNeeded)) {
    return (builder) => builder.select(getInputColumnSelections(builder, nodes, isFetchRoot));
  } else {
    return () => {};
  }
}

// Select only the columns that the graph gives, and always the ids. Related
// models are fetched without the join tables of their relations, so their join
// table extras are left out at the root of the fetch.
function getInputColumnSelections(builder, nodes, isFetchRoot) {
  const selections = new Map();

  for (const node of nodes) {
    const declaredColumns = getDeclaredColumns(node.modelClass);

    for (const key of Object.keys(node.obj.$toDatabaseJson(builder))) {
      // Select the json column of field expressions like `'meta:a'`:
      const column = getFieldExpressionColumn(key, declaredColumns) ?? key;

      if (!selections.has(column)) {
        const { relation } = node;
        const extra =
          relation?.keySide === 'join' &&
          relation.joinTableExtras.find((extra) => extra.aliasCol === column);

        if (!extra) {
          selections.set(column, `${builder.tableRefFor(node.modelClass)}.${column}`);
        } else if (!isFetchRoot) {
          const alias = relation.joinTableAliasFor(builder);
          selections.set(column, `${alias}.${extra.joinTableCol} as ${extra.aliasCol}`);
        }
      }
    }
  }

  const values = [...selections.values()];

  for (const idColumn of asArray(builder.fullIdColumn())) {
    if (!values.includes(idColumn)) {
      values.push(idColumn);
    }
  }

  return values;
}

// Lock the fetched rows like the upsert query asks for.
function lockLikeUpsert(builder, fetchBuilder) {
  for (const method of ['forUpdate', 'forShare', 'forNoKeyUpdate', 'forKeyShare']) {
    if (builder.has(method)) {
      fetchBuilder[method]();
    }
  }
}
