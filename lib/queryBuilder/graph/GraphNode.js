import { asArray, asSingle, isNumber, isObject, isString } from '../../utils/objectUtils.js';
import { ValidationErrorType } from '../../model/ValidationError.js';

// A model in a graph that is inserted or upserted, or in the current graph that
// is fetched from the database for it.
export class GraphNode {
  constructor(modelClass, obj, { parent = null, relation = null, index = null, relationPath }) {
    this.modelClass = modelClass;
    this.obj = obj;
    this.parent = parent;
    this.relation = relation;
    // The index in the array of a to-many relation, or of array input:
    this.index = index;
    this.children = [];
    this.relationPath = parent ? [...parent.relationPath, relation.name] : relationPath;
    this.relationPathKey = this.relationPath.join('.');
    // The id state of the input, before the writes complete ids with keys:
    this.hasId = obj.$hasId();

    // Read the markers of the graph, which `removeMarkers()` removes from the
    // models once all places of a model are read:
    const { uidProp, uidRefProp, dbRefProp, graphUnrelateProp, graphDeleteProp } = modelClass;
    this.uid = obj[uidProp];
    this.reference = obj[uidRefProp];
    this.dbReference = obj[dbRefProp];
    this.toBeUnrelated = obj[graphUnrelateProp] === true;
    this.toBeDeleted = obj[graphDeleteProp] === true;

    // The node of a `#ref` model, and the `#ref{}` properties of this model:
    this.referencedNode = null;
    this.propertyReferences = [];
    // The nodes whose `#ref` or `#ref{}` point to this node:
    this.referencingNodes = [];
    this.propertyReferencingNodes = [];

    // How the graph and the current graph pair up, see `GraphLoader`: The
    // current node at the place of an input node and the other way around, and
    // the current node of a related model's row fetched from elsewhere.
    this.current = null;
    this.node = null;
    this.row = null;
    this.isMissing = false;

    // Set by `GraphPlan`:
    this.isPruned = false;
  }

  get isReference() {
    return this.reference !== undefined;
  }

  get isDbReference() {
    return this.dbReference !== undefined;
  }

  get toBeUnrelatedOrDeleted() {
    return this.toBeUnrelated || this.toBeDeleted;
  }

  get isRoot() {
    return !this.parent;
  }

  // The current node of the row of this node, at its place or where a relate
  // moves it from.
  get existing() {
    return this.current || this.row;
  }

  get dataPath() {
    return this.parent
      ? [
          ...this.parent.dataPath,
          this.relation.name,
          ...(this.relation.isOneToOne() ? [] : [this.index]),
        ]
      : this.index !== null
        ? [this.index]
        : [];
  }

  // The data path in the form of validation errors, like `.pets[0].owner` or
  // `[1].pets[0].owner` for array input.
  get dataPathKey() {
    return this.dataPath.map((key) => (isNumber(key) ? `[${key}]` : `.${key}`)).join('');
  }

  get descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants]);
  }

  get activeChildren() {
    return this.children.filter((child) => !child.isPruned);
  }

  get rowKey() {
    return `${this.modelClass.getTableName()}:${this.obj.$idKey()}`;
  }

  // Build the nodes of `roots` and their related models in depth-first order.
  // `relationPath` is the place of the roots in the graph that a current graph
  // is fetched for. The roots of array input know their index in it.
  static buildGraph(modelClass, roots, relationPath = []) {
    const nodes = [];

    const addNode = (modelClass, obj, place) => {
      if (!isObject(obj) || !obj.$isObjectionModel) {
        throw createNotModelError(modelClass, obj);
      }

      const node = new GraphNode(modelClass, obj, place);
      nodes.push(node);
      place.parent?.children.push(node);

      for (const name of modelClass.getRelationNames()) {
        const related = obj[name];

        if (related) {
          const relation = modelClass.getRelation(name);
          const items = relation.isOneToOne() ? [asSingle(related)] : asArray(related);

          items.forEach((item, index) => {
            addNode(relation.relatedModelClass, item, { parent: node, relation, index });
          });
        }
      }
    };

    asArray(roots).forEach((root, index) => {
      addNode(modelClass, root, { relationPath, index: Array.isArray(roots) ? index : null });
    });

    return nodes;
  }

  // Remove the markers from the models, as they're neither written nor
  // returned, and return a function that puts them back if the writes fail.
  static removeMarkers(nodes) {
    const markers = [];

    for (const { modelClass, obj } of nodes) {
      for (const prop of [
        modelClass.uidProp,
        modelClass.uidRefProp,
        modelClass.dbRefProp,
        modelClass.graphUnrelateProp,
        modelClass.graphDeleteProp,
      ]) {
        if (Object.hasOwn(obj, prop)) {
          markers.push([obj, prop, obj[prop]]);
          delete obj[prop];
        }
      }
    }

    return () => {
      for (const [obj, prop, value] of markers) {
        obj[prop] = value;
      }
    };
  }

  // Link the `#ref` and `#ref{}` references of the nodes to the nodes with the
  // `#id` that they refer to.
  static linkReferences(nodes) {
    const nodesByUid = new Map();

    for (const node of nodes) {
      if (node.uid !== undefined) {
        nodesByUid.set(node.uid, node);
      }
    }

    const getNode = (uid) => {
      const node = nodesByUid.get(uid);

      if (!node) {
        throw new Error(`could not resolve reference ${uid} in a graph.`);
      }

      return node;
    };

    for (const node of nodes) {
      if (node.isReference) {
        node.referencedNode = getNode(node.reference);
        node.referencedNode.referencingNodes.push(node);
      }

      forEachPropertyReference(node.obj, ({ path, match, uid, refPath, isWholeValue }) => {
        const referencedNode = getNode(uid);
        node.propertyReferences.push({ path, match, refPath, isWholeValue, referencedNode });
        referencedNode.propertyReferencingNodes.push(node);
      });
    }
  }
}

function forEachPropertyReference(obj, callback) {
  const modelClass = obj.constructor;
  const relationNames = modelClass.getRelationNames();

  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
    } else if (isObject(value) && !Buffer.isBuffer(value)) {
      for (const key of Object.keys(value)) {
        visit(value[key], [...path, key]);
      }
    } else if (isString(value)) {
      for (const [match, uid, refPath] of value.matchAll(modelClass.propRefRegex)) {
        callback({
          path,
          match,
          uid,
          refPath: refPath.trim().split('.'),
          isWholeValue: match === value,
        });
      }
    }
  };

  for (const key of Object.keys(obj)) {
    if (!relationNames.includes(key)) {
      visit(obj[key], [key]);
    }
  }
}

export function createNotModelError(modelClass, value) {
  return modelClass.createValidationError({
    type: ValidationErrorType.InvalidGraph,
    message: `expected value "${value}" to be an instance of ${modelClass.name}`,
  });
}
