import { hasSameColumns, hasSameKey } from './graphKeys.js';

// What a graph insert or upsert does with each model of the graph and each row
// of the current graph: The rules that decide it, and the pruning of branches
// that nothing is written in.
export class GraphPlan {
  constructor({ nodes, graphOptions, keptNodes = new Map(), laterNodes = new Set() }) {
    this.nodes = nodes;
    // The nodes that an earlier pass left to this one before writing them:
    this.laterNodes = laterNodes;
    this.currentNodes = [];
    this.deferredNodes = new Set();
    // The nodes that earlier passes of the graph decided to keep or inserted,
    // by row:
    this.earlierKeptNodes = keptNodes;
    this.graphOptions = graphOptions;
    this.actions = null;
    // The decisions only change while the current graph is loaded, and are
    // cached once it is, see `cacheDecisions()`:
    this._intents = null;
    this._nodeActions = null;
    this._activeNodes = null;
    this._activeCurrentNodes = null;
    this._keptNodesByRowKey = null;
  }

  get activeNodes() {
    return (this._activeNodes ??= this.nodes.filter((node) => !node.isPruned));
  }

  get activeCurrentNodes() {
    return (this._activeCurrentNodes ??= this.currentNodes.filter(
      (currentNode) => !currentNode.isPruned,
    ));
  }

  // Leave `nodes` to a later pass of the graph.
  defer(nodes) {
    this.deferredNodes = new Set(nodes);
    this.nodes = this.nodes.filter((node) => !this.deferredNodes.has(node));
    this._activeNodes = null;
  }

  cacheDecisions() {
    this._intents = new Map();
    this._nodeActions = new Map();
  }

  // What the data asks to do with `node`, before the options that disable it:
  // Models marked with `#unrelate` or `#delete` are removed, references and
  // models with ids that the options let relate are related, models at their
  // place are patched, and new models are inserted. Models with ids that are
  // neither are `'missing'`.
  intentFor(node) {
    let intent = this._intents?.get(node);

    if (!intent) {
      intent = this._getIntent(node);
      this._intents?.set(node, intent);
    }

    return intent;
  }

  _getIntent(node) {
    const insertMissing = this.graphOptions.has(node, 'insertMissing');

    return node.toBeUnrelatedOrDeleted
      ? 'remove'
      : node.isReference
        ? 'relate'
        : node.isMissing
          ? insertMissing
            ? 'insert'
            : this.findInsertingNode(node)
              ? 'relate'
              : 'missing'
          : node.isDbReference || this._canRelate(node)
            ? 'relate'
            : node.current
              ? 'patch'
              : !node.hasId || insertMissing
                ? 'insert'
                : 'missing';
  }

  // Return true if the model of the `#ref` model `node` writes what `node`
  // would write to the row: The model is inserted, or it's written and its path
  // allows any write that the path of `node` allows.
  isCoveredByModel(node) {
    const { actions, graphOptions } = this;
    const { referencedNode } = node;
    const action = actions.get(referencedNode);
    const allowsWrite = (node) => graphOptions.shouldPatch(node) || graphOptions.shouldUpdate(node);
    return (
      action === 'insert' ||
      (['relate', 'patch'].includes(action) && (allowsWrite(referencedNode) || !allowsWrite(node)))
    );
  }

  // Return true if the graph writes the branch below `node`: below models at
  // their place, inserted models, related models with fetched rows and `#ref`
  // models, but not below removed or ignored ones.
  writesBranchOf(node) {
    const action = this.actionFor(node);

    return (
      !node.toBeUnrelatedOrDeleted &&
      (!!node.current ||
        action === 'insert' ||
        (action === 'relate' && (!!node.row || node.isReference)))
    );
  }

  // Find the model of the graph that inserts the missing row of `node` with its
  // id, so that `node` relates it once it's inserted. Models that are missing
  // themselves aren't inserted.
  findInsertingNode(node) {
    return this.nodes.find(
      (other) =>
        other !== node &&
        other.rowKey === node.rowKey &&
        !(other.isMissing && !this.graphOptions.has(other, 'insertMissing')) &&
        this.actionFor(other) === 'insert',
    );
  }

  // What the graph does with `node`: `'insert'`, `'relate'`, `'patch'` or
  // `'ignore'`. Once the writes start, read `actions` instead.
  actionFor(node) {
    let action = this._nodeActions?.get(node);

    if (!action) {
      action = this._getAction(node);
      this._nodeActions?.set(node, action);
    }

    return action;
  }

  _getAction(node) {
    const { graphOptions } = this;

    switch (this.intentFor(node)) {
      case 'insert':
        return graphOptions.has(node, 'noInsert') ? 'ignore' : 'insert';
      case 'relate':
        return !graphOptions.has(node, 'noRelate') ? 'relate' : node.current ? 'patch' : 'ignore';
      case 'patch':
        return 'patch';
      default:
        return 'ignore';
    }
  }

  // What the graph does with the row of `currentNode`: `'delete'`,
  // `'unrelate'` or `'keep'`.
  actionForCurrent(currentNode) {
    const { node } = currentNode;
    const has = (optionName) => this.graphOptions.has(currentNode, optionName);

    if (node) {
      // `#unrelate` takes precedence over `#delete` if both are set.
      return node.toBeUnrelated ? 'unrelate' : node.toBeDeleted ? 'delete' : 'keep';
    } else if (this._hasIgnoredOtherModel(currentNode)) {
      return 'keep';
    } else {
      const keptNodes = this.getKeptNodes(currentNode);

      if (keptNodes.some((keptNode) => !this._isUnrelatedWhenKept(currentNode, keptNode))) {
        return 'keep';
      } else if (keptNodes.length > 0 || has('unrelate')) {
        // Rows that the graph keeps in another place must not be deleted
        // (#214). They're unrelated instead, which replaces the delete, so
        // `noDelete` disables it too, unless the `unrelate` option asks for it.
        return has('noUnrelate') || (!has('unrelate') && has('noDelete')) ? 'keep' : 'unrelate';
      } else {
        return has('noDelete') ? 'keep' : 'delete';
      }
    }
  }

  // Leave out the branches that require no writes. We never do anything below
  // models that are removed, and we never delete recursively.
  prune() {
    const isInsertOnly = this.graphOptions.isInsertOnly();
    const passNodes = new Set([...this.nodes, ...this.currentNodes]);
    // The rows that were fetched for pruned nodes are left alone too. Nodes of
    // later passes aren't pruned here:
    const pruneNodes = (nodes) => {
      for (const node of nodes.filter((node) => passNodes.has(node))) {
        node.isPruned = true;

        for (const row of node.row ? [node.row, ...node.row.descendants] : []) {
          row.isPruned = true;
        }
      }

      this._activeNodes = null;
      this._activeCurrentNodes = null;
    };
    const pruneDescendants = (nodes) => pruneNodes(nodes.flatMap((node) => node.descendants));

    // Nothing is written below models that are neither inserted nor at their
    // place. `upsertGraph()` upserts the branches below related models, whose
    // rows were fetched for that, and below `#ref` models of new models, but
    // `insertGraph()` leaves them out (#217).
    pruneDescendants(
      this.activeNodes.filter(
        (node) =>
          !node.current &&
          this.intentFor(node) !== 'insert' &&
          !(
            this.actionFor(node) === 'relate' &&
            (node.row || (node.isReference && !this.graphOptions.isInsertOnly()))
          ),
      ),
    );

    // Nothing is written below models that `noInsert` skips, as their
    // descendants would be orphans (#215), except for the branches of their
    // children that the references of written models need: the ones that
    // models outside of all these branches point into, and then the ones that
    // the models of kept branches point into. The references of ignored models
    // are never resolved.
    const isSkipped = (node) =>
      this.intentFor(node) === 'insert' && this.actionFor(node) === 'ignore';
    const isBranch = (node) => !!node.parent && isSkipped(node.parent);
    const getBranches = (node) => {
      const branches = [];

      for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
        if (isBranch(ancestor)) {
          branches.push(ancestor);
        }
      }

      return branches;
    };
    const getReferencedNodes = (node) =>
      this.actionFor(node) === 'ignore'
        ? []
        : [node.referencedNode, ...node.propertyReferences.map((ref) => ref.referencedNode)].filter(
            (referencedNode) => referencedNode && !referencedNode.isPruned,
          );

    const keptBranches = new Set();
    const visitedNodes = new Set();
    const getNewKeptNodes = () =>
      this.activeNodes.filter(
        (node) =>
          !visitedNodes.has(node) && getBranches(node).every((branch) => keptBranches.has(branch)),
      );

    for (let nodes = getNewKeptNodes(); nodes.length > 0; nodes = getNewKeptNodes()) {
      for (const node of nodes) {
        visitedNodes.add(node);

        for (const branch of getReferencedNodes(node).flatMap(getBranches)) {
          keptBranches.add(branch);
        }
      }
    }

    pruneNodes(
      this.activeNodes
        .filter((node) => isBranch(node) && !keptBranches.has(node))
        .flatMap((node) => [node, ...node.descendants]),
    );

    if (!isInsertOnly) {
      // Rows that the graph removes are removed without their descendants. Don't
      // remove rows in relations that the graph doesn't mention.
      const removedNodes = this.activeCurrentNodes.filter((currentNode) => !currentNode.node);
      pruneDescendants(removedNodes);

      for (const currentNode of removedNodes) {
        const parentNode = currentNode.parent?.node;

        if (parentNode && parentNode.obj[currentNode.relation.name] === undefined) {
          currentNode.isPruned = true;
          this._activeCurrentNodes = null;
        }
      }

      // Models marked with `#unrelate` or `#delete` are unrelated or deleted as
      // a whole, in the graph and in the current graph.
      const markedNodes = this.activeNodes.filter((node) => node.toBeUnrelatedOrDeleted);
      pruneDescendants(markedNodes);
      pruneDescendants(markedNodes.map((node) => node.current).filter(Boolean));
    }

    return this;
  }

  // Decide what to do with each node once, before the first write, since the
  // writes change the models that the rules read. Only call this after
  // pruning.
  plan() {
    const actions = new Map();

    for (const node of this.activeNodes) {
      actions.set(node, this.actionFor(node));
    }

    for (const currentNode of this.activeCurrentNodes) {
      actions.set(currentNode, this.actionForCurrent(currentNode));
    }

    this.actions = actions;
    return this;
  }

  _canRelate(node) {
    return (
      this.graphOptions.has(node, 'relate') &&
      !node.current &&
      !node.isRoot &&
      hasRelateProp(node) &&
      !node.isMissing
    );
  }

  // An ignored model that isn't the current model of a to-one relation doesn't
  // replace it, so we keep the current one instead of removing it as missing.
  _hasIgnoredOtherModel(currentNode) {
    const { relation } = currentNode;
    const parentNode = currentNode.parent?.node;

    return (
      relation.isOneToOne() &&
      !!parentNode &&
      parentNode.activeChildren.some(
        (child) => child.relation === relation && this.actionFor(child) === 'ignore',
      )
    );
  }

  // A row that the graph keeps in another place, or that an earlier pass
  // inserted, is unrelated here, unless one of these places sets the same key
  // column, by relating, patching or inserting it through such a relation, or
  // through its own BelongsToOneRelation, e.g. `parent` for `children`: Then
  // that place writes the key, which may not be nullable. A has-one row that
  // its own BelongsToOneRelation or a later pass keeps is still unrelated if
  // this pass fills its slot with another row, as the foreign key may be
  // unique (#398).
  _isUnrelatedWhenKept(currentNode, keptNode) {
    const { relation } = currentNode;
    const isKeptInRelation = hasSameKey(relation, keptNode.relation);
    const isKeptByOwner =
      !isKeptInRelation &&
      keptNode.activeChildren.some(
        (child) =>
          child.relation.keySide === 'owner' &&
          this.actionFor(child) !== 'ignore' &&
          hasSameColumns(child.relation.ownerProp, relation.relatedProp),
      );
    return (
      relation.keySide !== 'related' ||
      !(isKeptInRelation || isKeptByOwner) ||
      ((isKeptByOwner || this.deferredNodes.has(keptNode)) && this._hasNewRowInSlot(currentNode))
    );
  }

  // Return true if this pass inserts or relates a row into the slot of the
  // has-one relation that `currentNode` is in.
  _hasNewRowInSlot(currentNode) {
    return (
      currentNode.relation.isOneToOne() &&
      this.nodes.some(
        (node) =>
          node.relation === currentNode.relation &&
          node.parent.existing === currentNode.parent &&
          ['insert', 'relate'].includes(this.actionFor(node)),
      )
    );
  }

  // The nodes that keep the row of `node` in other places of the graph, by
  // relating or patching it there, or that an earlier pass inserted.
  getKeptNodes(node) {
    return this.keptNodes.get(node.rowKey) || [];
  }

  // The nodes that keep their rows in the next passes, once this one is
  // written: the ones that it decided to keep before its writes, and the ones
  // that it inserts.
  getNextKeptNodes() {
    const keptNodes = new Map(this.keptNodes);

    for (const node of this.activeNodes) {
      if (this.actions.get(node) === 'insert') {
        addKeptNode(keptNodes, node);
      }
    }

    return keptNodes;
  }

  // The nodes that keep their rows by relating or patching them, by row, also
  // the ones that earlier passes decided to keep or inserted. A row may be kept
  // in several places.
  get keptNodes() {
    if (!this._keptNodesByRowKey) {
      this._keptNodesByRowKey = new Map(this.earlierKeptNodes);

      for (const node of [...this.activeNodes, ...this.deferredNodes]) {
        const action = this.actionFor(node);

        if (node.obj.$hasId() && (action === 'relate' || action === 'patch')) {
          addKeptNode(this._keptNodesByRowKey, node);
        }
      }
    }

    return this._keptNodesByRowKey;
  }
}

function addKeptNode(keptNodes, node) {
  keptNodes.set(node.rowKey, [...(keptNodes.get(node.rowKey) || []), node]);
}

// For `HasMany` and `HasOne` relations, the relate prop is the id of the
// related model. Use the id state of the input graph, since the parent's
// insert copies the foreign key into the related model, which can complete
// a composite id that contains it and would turn an insert into a relate (#2544).
function hasRelateProp(node) {
  const { relation } = node;
  return relation.keySide === 'related' ? node.hasId : relation.hasRelateProp(node.obj);
}
