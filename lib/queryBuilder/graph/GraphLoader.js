import { asArray, chunk, groupBy, uniqBy } from '../../utils/objectUtils.js';
import { getMaxRows } from '../../utils/knexUtils.js';
import { FetchStrategy } from './GraphOptions.js';
import { GraphNode } from './GraphNode.js';
import { RelationExpression } from '../RelationExpression.js';
import { getDeclaredColumns } from '../operations/fieldExpressions.js';
import { getFieldExpressionColumn } from '../../utils/parseFieldExpression.js';

// Fetch the current state of the graph from the database and pair its rows with
// the models of the graph: First the roots with their relations, then the rows
// of the models that the graph relates from elsewhere, with the relations that
// the graph gives them, level by level, as the rows of related models decide
// which models below them are related too. Models that `insertMissing` inserts
// if they don't exist are looked up too.
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

  // Find the models that the graph relates and gives relations, or inserts
  // with `insertMissing` if they don't exist, and that aren't fetched yet. The
  // ones below others wait for their rows, and the ones in branches that the
  // graph doesn't write are left out.
  const findRelatedNodes = () => {
    const rowKeys = new Set(plan.currentNodes.map((currentNode) => currentNode.rowKey));
    const nodes = plan.nodes.filter(
      (node) =>
        !fetchedNodes.has(node) &&
        !node.current &&
        node.obj.$hasId() &&
        plan.actionFor(node) === 'relate' &&
        (hasRelations(node.obj) ||
          (plan.graphOptions.has(node, 'insertMissing') && !rowKeys.has(node.rowKey))),
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

  await fetch(
    plan.nodes.filter((node) => node.isRoot && node.hasId),
    { areRelated: false },
  );

  for (let nodes = findRelatedNodes(); nodes.length > 0; nodes = findRelatedNodes()) {
    await fetch(nodes, { areRelated: true });
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

// Fetch the rows of `nodes` with their relations, in as many queries as the
// number of their ids requires.
async function fetchModels(builder, graphOptions, nodes) {
  const [{ modelClass }] = nodes;
  const uniqueNodes = uniqBy(nodes, (node) => node.obj.$idKey());
  const maxIds = getMaxRows(builder.unsafeKnex(), modelClass.getIdColumnArray().length);
  const models = [];

  for (const chunkNodes of chunk(uniqueNodes, maxIds)) {
    models.push(...(await fetchModelsOfNodes(builder, graphOptions, chunkNodes)));
  }

  return models;
}

function fetchModelsOfNodes(builder, graphOptions, nodes) {
  const [{ modelClass }] = nodes;
  const ids = nodes.map((node) => node.obj.$id());
  const expression = RelationExpression.fromModelGraph(nodes.map((node) => node.obj));

  return modelClass
    .query()
    .childQueryOf(builder, { fork: true, isInternalQuery: true })
    .modify((fetchBuilder) => {
      // Lock the fetched rows like the upsert query asks for.
      for (const method of ['forUpdate', 'forShare', 'forNoKeyUpdate', 'forKeyShare']) {
        if (builder.has(method)) {
          fetchBuilder[method]();
        }
      }
    })
    .modify((fetchBuilder) => {
      for (const [relationPath, pathNodes] of getNodesByRelationPath(nodes, expression)) {
        const select = createSelect(pathNodes, graphOptions, !relationPath);

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
