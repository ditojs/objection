import { asArray, chunk, groupBy } from '../../utils/objectUtils.js';
import { getMaxRows } from '../../utils/knexUtils.js';
import { FetchStrategy } from './GraphOptions.js';
import { isOtherKey } from './graphKeys.js';
import { GraphNode } from './GraphNode.js';
import { RelationExpression } from '../RelationExpression.js';
import { getDeclaredColumns } from '../operations/fieldExpressions.js';
import { getFieldExpressionColumn } from '../../utils/parseFieldExpression.js';

// Fetch the current state of the graph from the database and pair its rows with
// the models of the graph: First the roots with their relations, then the rows
// of the models that the graph relates from elsewhere, with the relations that
// the graph gives them, level by level, as the rows of related models decide
// which models below them are related too. Models that `insertMissing` inserts
// if they don't exist are looked up too. The relations of rows whose keys
// change are read again by `loadRelationsAtFinalKeys()`.
export async function loadCurrentGraph(builder, plan) {
  const fetchedNodes = new Set();

  const fetch = async (nodes, { areRelated }) => {
    for (const node of nodes) {
      fetchedNodes.add(node);
    }

    for (const nodesOfClass of groupBy(nodes, (node) => node.modelClass).values()) {
      const models = await fetchModels(builder, plan.graphOptions, nodesOfClass);
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
    const nodeSet = new Set(nodes);

    return nodes.filter((node) => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (nodeSet.has(parent) || !plan.writesBranchOf(parent)) {
          return false;
        }
      }

      return true;
    });
  };

  // The roots are at their places:
  await fetch(
    plan.nodes.filter((node) => !node.parent && node.hasId),
    { areRelated: false },
  );

  // The rows of the related models that the graph gives relations, or inserts
  // with `insertMissing` if they don't exist:
  const hasRelatedRow = (node, rowKeys) =>
    hasRelations(node) ||
    (plan.graphOptions.has(node, 'insertMissing') && !rowKeys.has(node.rowKey));

  for (
    let nodes = findRelatedNodes(hasRelatedRow);
    nodes.length > 0;
    nodes = findRelatedNodes(hasRelatedRow)
  ) {
    await fetch(nodes, { areRelated: true });
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
}

// Fetch the relations of the moved rows and of the rows whose keys for their
// relations change at the keys that the graph gives them, as `keys` solves
// them, and pair them in place of the relations that were read before. A key
// that a new row gives has no current related rows yet. The relations are read
// level by level, as the rows below them may move too. Return the props of the
// keys that were read.
export async function loadRelationsAtFinalKeys(builder, plan, keys) {
  const readKeys = new Map();
  // A BelongsToOne relation is read at its final key only where another place
  // moves the row on its column; otherwise its row is replaced:
  const isRead = (node, relation) =>
    relation.keySide !== 'owner' || keys.isSetByOtherPlaces(node, relation);
  const isChanged = (node) =>
    getRelations(node).some(
      (relation) =>
        isRead(node, relation) &&
        isOtherKey(
          keys.getReadProps(node, relation.ownerProp),
          relation.ownerProp.getProps(node.existing.obj),
        ),
    );

  const readNodes = new Set(
    plan.nodes.filter(
      (node) => !node.isPruned && node.existing && hasRelations(node) && isChanged(node),
    ),
  );
  // The rows below them are read again with them, or on their own if they
  // aren't found there any more:
  const readCurrentNodes = new Set([...readNodes].flatMap((node) => node.existing.descendants));

  for (const node of plan.nodes) {
    if (!node.isPruned && readCurrentNodes.has(node.existing) && hasRelations(node)) {
      readNodes.add(node);
    }
  }
  // Clones of the current rows of the topmost rows to read, with the relations
  // read into them. The ones below that aren't found there are read on their
  // own then:
  const models = new Map();
  const reachedNodes = new Set();

  for (
    let starts = getTopmostNodes(readNodes);
    starts.length > 0;
    starts = getTopmostNodes(
      [...readNodes].filter((node) => !models.has(node) && !reachedNodes.has(node)),
    )
  ) {
    for (const node of starts) {
      models.set(node, node.existing.obj.$clone({ shallow: true }));
    }

    for (let level = starts.map((node) => [node, models.get(node)]); level.length > 0;) {
      const nextLevel = [];
      // Rows of a model class are read together when the graph gives them the
      // same relations:
      const groups = groupBy(level, ([node]) =>
        [node.modelClass.name, ...getRelations(node).map((relation) => relation.name)].join(':'),
      );

      for (const entries of groups.values()) {
        const [[node]] = entries;
        const relations = getRelations(node);
        // Set the read keys, and keep the current ones to put back:
        const currentKeys = [];

        for (const [node, model] of entries) {
          const values = {};
          const nodeKeys = [];

          for (const relation of relations.filter((relation) => isRead(node, relation))) {
            const readValues = keys.getReadProps(node, relation.ownerProp);
            relation.ownerProp.forEach((i) => {
              values[relation.ownerProp.props[i]] = relation.ownerProp.getProp(model, i);
              relation.ownerProp.setProp(model, i, readValues[i] ?? null);
            });
            nodeKeys.push([relation.ownerProp, readValues]);
          }

          readKeys.set(node, nodeKeys);
          currentKeys.push(values);
        }
        const fetched = await createFetchQuery(
          builder,
          plan.graphOptions,
          node.modelClass,
          entries.map(([node]) => node),
          RelationExpression.create(`[${relations.map((relation) => relation.name).join(', ')}]`),
        )
          .resolve(entries.map(([, model]) => model))
          .findOptions({ dontCallFindHooks: true });

        entries.forEach(([node, model], i) => {
          // The rows keep their current keys:
          Object.assign(model, fetched[i], currentKeys[i]);

          // The related rows that the graph gives relations are read next:
          for (const child of node.children) {
            if (child.obj.$hasId() && hasRelations(child)) {
              const key = child.obj.$idKey();
              const row = asArray(model[child.relation.name]).find((row) => row?.$idKey() === key);

              if (row) {
                reachedNodes.add(child);
                nextLevel.push([child, row]);
              }
            }
          }
        });
      }

      level = nextLevel;
    }
  }

  // Replace the current nodes below the rows that were read, and pair again:
  const removedNodes = new Set();

  for (const node of new Set([...readNodes, ...reachedNodes])) {
    for (const currentNode of node.existing?.descendants || []) {
      removedNodes.add(currentNode);
    }

    // Rows found at their place don't need the rows fetched for their relates:
    if (reachedNodes.has(node) && node.row) {
      removedNodes.add(node.row);
    }
  }

  for (const node of models.keys()) {
    const [root, ...currentNodes] = GraphNode.buildGraph(
      node.modelClass,
      models.get(node),
      node.relationPath,
    );
    const { existing } = node;

    if (removedNodes.has(existing)) {
      // Rows below others that aren't read there any more lose their place,
      // and are related with the rows read for them:
      node.current = null;
      node.row = root;
      root.node = node;
      plan.currentNodes.push(root, ...currentNodes);
    } else {
      for (const child of root.children) {
        child.parent = existing;
      }

      existing.children = root.children;
      plan.currentNodes.push(...currentNodes);
    }
  }

  plan.currentNodes = plan.currentNodes.filter((currentNode) => !removedNodes.has(currentNode));

  for (const node of plan.nodes) {
    if (removedNodes.has(node.current)) {
      node.current = null;
    }

    if (removedNodes.has(node.row)) {
      node.row = null;
    }
  }

  for (const node of models.keys()) {
    pairChildren(node, node.existing);
  }

  return readKeys;
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

// Return the nodes that have no ancestor among `nodes`.
function getTopmostNodes(nodes) {
  const nodeSet = new Set(nodes);
  return [...nodeSet].filter((node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (nodeSet.has(parent)) {
        return false;
      }
    }

    return true;
  });
}

// The relations that the graph gives the model of `node`:
function getRelations(node) {
  const { modelClass, obj } = node;
  return modelClass
    .getRelationNames()
    .filter((name) => obj[name] !== undefined)
    .map((name) => modelClass.getRelation(name));
}

function hasRelations(node) {
  return getRelations(node).length > 0;
}

// Fetch the rows of `nodes` with the relations that the graph gives them, or
// only their ids, in as many queries as the number of their ids requires. Each
// row is fetched once, with the relations of all its places.
async function fetchModels(builder, graphOptions, nodes, { onlyIds = false } = {}) {
  const [{ modelClass }] = nodes;
  const nodesByRow = [...groupBy(nodes, (node) => node.obj.$idKey()).values()];
  const maxIds = getMaxRows(builder.unsafeKnex(), modelClass.getIdColumnArray().length);
  const models = [];

  for (const chunkNodes of chunk(nodesByRow, maxIds)) {
    const nodes = chunkNodes.flat();
    const expression = RelationExpression.fromModelGraph(
      onlyIds ? [] : nodes.map((node) => node.obj),
    );
    models.push(
      ...(await createFetchQuery(
        builder,
        graphOptions,
        modelClass,
        nodes,
        expression,
        onlyIds,
      ).findByIds(chunkNodes.map(([node]) => node.obj.$id()))),
    );
  }

  return models;
}

// Create the query that fetches the rows of `nodes` with the relations of
// `expression`, locked like the upsert query asks for, and with the columns
// that the fetch strategy selects for them and their related models.
function createFetchQuery(builder, graphOptions, modelClass, nodes, expression, onlyIds = false) {
  return modelClass
    .query()
    .childQueryOf(builder, { fork: true, isInternalQuery: true })
    .modify((fetchBuilder) => {
      for (const method of ['forUpdate', 'forShare', 'forNoKeyUpdate', 'forKeyShare']) {
        if (builder.has(method)) {
          fetchBuilder[method]();
        }
      }

      for (const [relationPath, pathNodes] of getNodesByRelationPath(nodes, expression)) {
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
    .withGraphFetched(expression)
    .internalOptions({ keepImplicitJoinProps: true });
}

// Group the fetched nodes and their descendants by their relation paths below
// the fetched nodes, for the paths of `expression`. Relations with nulls or
// empty arrays have no nodes, but are fetched too.
function getNodesByRelationPath(nodes, expression) {
  const nodesByRelationPath = new Map([['', []]]);
  const addPaths = (expressionNode, path) => {
    for (const name of expressionNode.$childNames) {
      const relationPath = [...path, name];
      nodesByRelationPath.set(relationPath.join('.'), []);
      addPaths(expressionNode[name], relationPath);
    }
  };

  addPaths(expression.node, []);

  for (const node of nodes) {
    const depth = node.relationPath.length;

    for (const descendant of [node, ...node.descendants]) {
      nodesByRelationPath.get(descendant.relationPath.slice(depth).join('.'))?.push(descendant);
    }
  }

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

  // The keys of the relations that the graph gives, which rows read their
  // relations at, see `loadRelationsAtFinalKeys()`:
  for (const node of nodes) {
    for (const column of getRelations(node).flatMap((relation) => relation.ownerProp.cols)) {
      if (!selections.has(column)) {
        selections.set(column, `${builder.tableRefFor(node.modelClass)}.${column}`);
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
