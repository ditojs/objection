import { asArray, chunk, groupBy } from '../../utils/objectUtils.js';
import { getMaxRows } from '../../utils/knexUtils.js';
import { FetchStrategy } from './GraphOptions.js';
import { isOtherKey } from './graphKeys.js';
import { GraphNode } from './GraphNode.js';
import { RelationExpression } from '../RelationExpression.js';
import { getDeclaredColumns } from '../operations/fieldExpressions.js';
import { getFieldExpressionColumn } from '../../utils/parseFieldExpression.js';

// Fetch the current state of the graph from the database and pair its rows with
// the models of the graph, from scratch: First the roots, then the rows of the
// models that the graph relates from elsewhere, each with the relations that
// the graph gives them, level by level, as the rows of related models decide
// which models below them are related too. Models that `insertMissing` inserts
// if they don't exist are looked up too. The relations are read at their
// current keys, or at the ones of `readKeys`, see `getReadKeys()`.
export async function loadCurrentGraph(builder, plan, readKeys = null) {
  const { graphOptions } = plan;
  const fetchedNodes = new Set();
  plan.reset();

  const fetch = async (nodes, { areRelated }) => {
    for (const node of nodes) {
      fetchedNodes.add(node);
    }

    for (const nodesOfClass of groupBy(nodes, (node) => node.modelClass).values()) {
      const models = await fetchModels(builder, graphOptions, nodesOfClass);
      const modelsByKey = new Map(models.map((model) => [model.$idKey(), model]));
      const entries = [];

      for (const node of nodesOfClass) {
        const model = modelsByKey.get(node.obj.$idKey());

        if (model) {
          entries.push([node, model]);
        } else if (areRelated) {
          node.isMissing = true;
        }
      }

      await readRelations(builder, graphOptions, entries, readKeys);

      for (const [node, model] of entries) {
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
        !hasIdReference(node) &&
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
    plan.nodes.filter((node) => !node.parent && node.hasId && !hasIdReference(node)),
    { areRelated: false },
  );

  // The rows of the related models that the graph gives relations, or inserts
  // with `insertMissing` if they don't exist:
  const hasRelatedRow = (node, rowKeys) =>
    node.relations.length > 0 ||
    (graphOptions.has(node, 'insertMissing') && !rowKeys.has(node.rowKey));

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
    const models = await fetchModels(builder, graphOptions, nodesOfClass, { onlyIds: true });
    const idKeys = new Set(models.map((model) => model.$idKey()));

    for (const node of nodesOfClass) {
      node.isMissing = !idKeys.has(node.obj.$idKey());
    }
  }
}

// Return the keys at which the relations of the rows whose keys change are read
// once the graph is planned, by node and relation, or `null` if all are read at
// their current keys: where the rows that give the final keys are now, see
// `GraphKeys.getReadProps()`. A BelongsToOne relation is read at its final key
// only where another place moves the row on its column; otherwise its row is
// replaced.
export function getReadKeys(plan, keys) {
  const readKeys = new Map();
  let isChanged = false;

  for (const node of plan.activeNodes) {
    if (node.existing) {
      for (const relation of node.relations) {
        if (relation.keySide !== 'owner' || keys.isSetByOtherPlaces(node, relation)) {
          const values = keys.getReadProps(node, relation.ownerProp);
          const nodeKeys = readKeys.get(node) || new Map();
          readKeys.set(node, nodeKeys.set(relation, values));
          isChanged ||= isOtherKey(values, relation.ownerProp.getProps(node.existing.obj));
        }
      }
    }
  }

  return isChanged ? readKeys : null;
}

// Read the relations that the graph gives the models of `entries`, `[node,
// model]` pairs, into the models, level by level, at the keys of `readKeys` or
// at their current ones. The rows of a model class are read together, with the
// relations of all their places.
async function readRelations(builder, graphOptions, entries, readKeys) {
  for (let level = entries; level.length > 0;) {
    const nextLevel = [];

    for (const levelEntries of groupBy(level, ([node]) => node.modelClass).values()) {
      const [[{ modelClass }]] = levelEntries;
      const nodes = levelEntries.map(([node]) => node);
      const relations = [...new Set(nodes.flatMap((node) => node.relations))];
      const models = [...new Set(levelEntries.map(([, model]) => model))];
      // Set the read keys, and keep the current ones to put back:
      const currentKeys = new Map(models.map((model) => [model, {}]));

      for (const [node, model] of levelEntries) {
        for (const [relation, values] of readKeys?.get(node) || []) {
          relation.ownerProp.forEach((i) => {
            const keys = currentKeys.get(model);
            const prop = relation.ownerProp.props[i];
            // Relations on the same column keep its first, current value:
            if (!(prop in keys)) {
              keys[prop] = relation.ownerProp.getProp(model, i);
            }

            relation.ownerProp.setProp(model, i, values[i] ?? null);
          });
        }
      }

      if (relations.length > 0) {
        const expression = RelationExpression.create(
          `[${relations.map((relation) => relation.name).join(', ')}]`,
        );
        const fetched = await createFetchQuery(builder, graphOptions, modelClass, nodes, expression)
          .resolve(models)
          .findOptions({ dontCallFindHooks: true });

        models.forEach((model, i) => Object.assign(model, fetched[i], currentKeys.get(model)));
      }

      // The related rows that the graph gives relations are read next:
      for (const [node, model] of levelEntries) {
        for (const child of node.children) {
          if (child.obj.$hasId() && child.relations.length > 0) {
            const key = child.obj.$idKey();
            const row = asArray(model[child.relation.name]).find((row) => row?.$idKey() === key);

            if (row) {
              nextLevel.push([child, row]);
            }
          }
        }
      }
    }

    level = nextLevel;
  }
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
  // The current rows of a relation by id, once the graph pairs models in it:
  const childrenByKey = new Map();
  const getChildrenByKey = (name) => {
    let children = childrenByKey.get(name);

    if (!children) {
      children = groupBy(childrenByRelation.get(name) || [], (child) => child.obj.$idKey());
      childrenByKey.set(name, children);
    }

    return children;
  };

  for (const child of node.children) {
    if (child.obj.$hasId()) {
      const currentChildren = getChildrenByKey(child.relation.name).get(child.obj.$idKey());

      for (const currentChild of currentChildren || []) {
        pair(child, currentChild);
      }
    }
  }
}

// Return true if an id of `node` is a `#ref{}`, which is only known once the
// model that it refers to is written, so that its row can't be looked up.
function hasIdReference(node) {
  const idProps = node.modelClass.getIdPropertyArray();
  return node.propertyReferences.some(({ path }) => idProps.includes(path[0]));
}

// Fetch the rows of `nodes`, or only their ids, in as many queries as the
// number of their ids requires, each row once for all its places.
async function fetchModels(builder, graphOptions, nodes, { onlyIds = false } = {}) {
  const [{ modelClass }] = nodes;
  const nodesByRow = [...groupBy(nodes, (node) => node.obj.$idKey()).values()];
  const maxIds = getMaxRows(builder.unsafeKnex(), modelClass.getIdColumnArray().length);
  const expression = RelationExpression.create('[]');
  const models = [];

  for (const chunkNodes of chunk(nodesByRow, maxIds)) {
    models.push(
      ...(await createFetchQuery(
        builder,
        graphOptions,
        modelClass,
        chunkNodes.flat(),
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
    return (builder) => builder.select(getKeySelections(builder, nodes));
  } else if (graphOptions.isFetchStrategy(FetchStrategy.OnlyNeeded)) {
    return (builder) => builder.select(getInputColumnSelections(builder, nodes, isFetchRoot));
  } else {
    return () => {};
  }
}

// Select the ids, and the keys of the relations that the graph gives, which
// `readRelations()` reads the relations at.
function getKeySelections(builder, nodes) {
  const columns = new Set([
    ...asArray(builder.fullIdColumn()),
    ...nodes.flatMap((node) =>
      node.relations.flatMap((relation) =>
        relation.ownerProp.cols.map(
          (column) => `${builder.tableRefFor(node.modelClass)}.${column}`,
        ),
      ),
    ),
  ]);
  return [...columns];
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

  return [...new Set([...selections.values(), ...getKeySelections(builder, nodes)])];
}
