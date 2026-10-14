import { hasOwnerKey } from './graphKeys.js';
import { groupBy } from '../../utils/objectUtils.js';

// Order the writes of a planned graph in steps that keep keys and constraints
// intact (#214), which `GraphWriter` writes:
// 1. Move the rows that the graph relates to existing owners of HasMany and
//    HasOne relations, as they may still sit below rows that the next step
//    deletes. Rows that wait for inserts are related in step 3 or 4.
// 2. Remove rows that reference their owners, before the inserts that may need
//    their unique keys.
// 3. Insert the new rows in the order of their keys and references, then the
//    keys deferred to break cycles and the join rows. Rows that move out of
//    the slots of HasOneRelations that new rows go into are related in the
//    same order, as the foreign key may be unique.
// 4. Patch the changed rows, the other relates, and the keys of owners whose
//    BelongsToOne rows were inserted, related or removed.
// 5. Remove the BelongsToOne rows that the owners no longer reference.
// Each step writes a row that goes into the slot of a HasOneRelation after the
// row that moves out of it, unless that closes a cycle.
// `insertGraph()` only inserts.
export class GraphSchedule {
  constructor(plan) {
    this.plan = plan;
    // The nodes that each node waits for, through its keys, its references and
    // the rows that move out of the slots that it goes into:
    this.dependencies = createDependencies(plan);
    // Dependencies that aren't waited for, to break cycles. Deferred keys are
    // written after the inserts:
    this.deferredDependencies = new Set();
    // Relates whose rows are moved to their new owners before the removals:
    this.movedNodes = new Set(
      plan.graphOptions.isInsertOnly()
        ? []
        : plan.activeNodes.filter((node) => this._isMovedFirst(node)),
    );
    // Relates that move the rows out of the slots of HasOneRelations that new
    // rows go into, and that aren't moved first:
    this.slotMovedNodes = this._getSlotMovedNodes();
    this.steps = this._planSteps();
  }

  _planSteps() {
    const { activeNodes, activeCurrentNodes, actions, graphOptions } = this.plan;
    const insertSteps = [
      ...this._planLevels(activeNodes, { resolvesReferences: true }).map((level) => ({
        kind: 'insert',
        ...level,
      })),
      {
        kind: 'deferredKeys',
        dependencies: [...this.deferredDependencies].filter((dependency) => dependency.relation),
      },
      {
        kind: 'joinRows',
        nodes: activeNodes.filter(
          (node) =>
            node.relation?.keySide === 'join' &&
            !node.current &&
            ['insert', 'relate'].includes(actions.get(node)) &&
            // Models that `noInsert` skips have no key for join rows (#369):
            actions.get(node.parent) !== 'ignore',
        ),
      },
    ];

    if (graphOptions.isInsertOnly()) {
      return insertSteps;
    } else {
      const removedNodes = activeCurrentNodes.filter((node) => actions.get(node) !== 'keep');
      const isReferencedByOwner = (currentNode) => currentNode.relation.keySide === 'owner';

      return [
        ...this._planLevels([...this.movedNodes]).map(({ nodes }) => ({ kind: 'move', nodes })),
        {
          kind: 'remove',
          nodes: removedNodes.filter((node) => !isReferencedByOwner(node)),
          areReferenced: true,
        },
        ...insertSteps,
        ...this._planLevels(
          activeNodes.filter((node) => {
            const action = actions.get(node);
            return (
              (action === 'patch' ||
                (action === 'relate' &&
                  !this.movedNodes.has(node) &&
                  !this.slotMovedNodes.has(node))) &&
              // The row of a `#ref` model is written once, by its model:
              !this._isWrittenByModel(node)
            );
          }),
        ).map(({ nodes }) => ({ kind: 'patch', nodes })),
        {
          kind: 'remove',
          // Owners unrelate their BelongsToOne rows by patching their keys:
          nodes: removedNodes.filter(
            (node) => isReferencedByOwner(node) && actions.get(node) === 'delete',
          ),
          areReferenced: false,
        },
      ];
    }
  }

  // Group the nodes into levels that can be written once the levels before
  // them are: Nodes wait for the nodes whose keys they store, the nodes that
  // they reference, and the rows that move out of the slots they go into. For
  // the inserts, all nodes take part, so that the keys of the nodes that aren't
  // inserted are resolved in order too, and `resolvesReferences` says so.
  _planLevels(nodes, { resolvesReferences = false } = {}) {
    const nodeSet = new Set(nodes);
    const handledNodes = new Set();
    const levels = [];

    // The keys of models with rows are known, also of related models that were
    // fetched, except for the props that the graph fills in:
    const hasRow = (node) => !!(node.referencedNode || node).existing;
    // Nodes outside this pass were written by an earlier one, or are never
    // written, see `checkReferences()`:
    const getPendingDependencies = (node) =>
      (this.dependencies.get(node) || []).filter(
        (dependency) =>
          nodeSet.has(dependency.node) &&
          !this.deferredDependencies.has(dependency) &&
          !handledNodes.has(dependency.node) &&
          (dependency.isSlotMove || !hasRow(dependency.node) || this.readsFilledProps(dependency)),
      );

    // Return true if `node` waits for `blockingNode`, through other nodes too.
    const isBlockedBy = (node, blockingNode, visitedNodes = new Set()) => {
      if (node === blockingNode) {
        return true;
      } else if (visitedNodes.has(node)) {
        return false;
      } else {
        visitedNodes.add(node);
        return getPendingDependencies(node).some((dependency) =>
          isBlockedBy(dependency.node, blockingNode, visitedNodes),
        );
      }
    };

    // Break a cycle by deferring one BelongsToOne key that points to a `#ref`
    // model: Its owner is inserted without the key, which is patched in once
    // the referenced model is inserted. Without `#ref`, the graph is a tree,
    // and only waits for the rows that move out of slots can close a cycle,
    // like rows that swap slots. One of these isn't waited for then.
    const breakCycle = () => {
      for (const canDefer of [
        (dependency, node) => this._canDefer(dependency, node),
        (dependency) => dependency.isSlotMove,
      ]) {
        for (const node of nodes) {
          if (!handledNodes.has(node)) {
            for (const dependency of getPendingDependencies(node)) {
              if (canDefer(dependency, node) && isBlockedBy(dependency.node, node)) {
                this.deferredDependencies.add(dependency);
                return true;
              }
            }
          }
        }
      }

      return false;
    };

    const isReady = (node) => !handledNodes.has(node) && getPendingDependencies(node).length === 0;
    const isReadyReference = (node) => resolvesReferences && node.isReference && isReady(node);

    while (handledNodes.size < nodes.length) {
      const levelNodes = nodes.filter(isReady);

      if (levelNodes.length > 0) {
        const level = { nodes: levelNodes, references: [] };
        levels.push(level);

        for (const node of levelNodes) {
          handledNodes.add(node);
        }

        // `#ref` models aren't inserted. They're resolved right after the
        // inserts of the level that completes their dependencies, so that the
        // nodes that wait for them can be inserted in the next level (#311).
        // The other steps write them in levels of their own.
        for (
          let references = nodes.filter(isReadyReference);
          references.length > 0;
          references = nodes.filter(isReadyReference)
        ) {
          for (const node of references) {
            handledNodes.add(node);
            level.references.push(node);
          }
        }
      } else if (!breakCycle()) {
        throw new Error('the object graph contains cyclic references');
      }
    }

    return levels;
  }

  _canDefer(dependency, node) {
    const { actions } = this.plan;
    const { relation } = dependency;

    return (
      relation &&
      hasOwnerKey(relation) &&
      dependency.node.isReference &&
      // The owner is patched by its id, which models without one don't have (#2305).
      node.modelClass.getIdColumnArray().length > 0 &&
      // Both ends need to be inserted for the key to be patched in later.
      actions.get(node) === 'insert' &&
      actions.get(dependency.node.referencedNode) === 'insert' &&
      // A `#ref{}` that reads the key might be resolved before it's patched in.
      !node.propertyReferencingNodes.some((referencingNode) =>
        referencingNode.propertyReferences.some(
          (reference) =>
            reference.referencedNode === node &&
            relation.ownerProp.props.includes(reference.refPath[0]),
        ),
      )
    );
  }

  // Return true if the HasMany or HasOne relate of `node` moves its row to an
  // existing owner before the removals, see the steps above. `#ref` models may
  // get their ids from the inserts, rows that wait for the inserts are written
  // once they're known, and a relate into the slot of a HasOne row waits for
  // the removal of that row, or its move, as its key may be unique.
  _isMovedFirst(node, visitedNodes = new Set()) {
    const { actions } = this.plan;
    visitedNodes.add(node);

    if (
      actions.get(node) === 'relate' &&
      !node.isReference &&
      node.relation.keySide === 'related' &&
      node.parent.existing &&
      !this._waitsForInserts(node)
    ) {
      const slotNode = getSlotNode(node);
      const moverNode = getSlotMover(this.plan, node);
      return (
        !(slotNode && actions.get(slotNode) !== 'keep') &&
        // Swapped rows are related together:
        (!moverNode || visitedNodes.has(moverNode) || this._isMovedFirst(moverNode, visitedNodes))
      );
    } else {
      return false;
    }
  }

  // Find the relates that move the rows out of the slots of HasOneRelations
  // that new rows go into, and that aren't moved first. They're related in the
  // inserts, along with the relates that move the rows out of their own slots,
  // as the foreign key may be unique.
  _getSlotMovedNodes() {
    const nodes = new Set();
    const addMoverNodes = (node) => {
      for (const { node: moverNode, isSlotMove } of this.dependencies.get(node) || []) {
        if (isSlotMove && !this.movedNodes.has(moverNode) && !nodes.has(moverNode)) {
          nodes.add(moverNode);
          addMoverNodes(moverNode);
        }
      }
    };

    for (const node of this.plan.activeNodes) {
      if (this.plan.actions.get(node) === 'insert') {
        addMoverNodes(node);
      }
    }

    return nodes;
  }

  // Return the props of `node` that the graph fills in from other models,
  // through its relations and its references.
  getFilledProps(node) {
    return (this.dependencies.get(node) || []).flatMap((dependency) =>
      dependency.reference
        ? [dependency.reference.path[0]]
        : dependency.relation
          ? getKeyProps(dependency, node)
          : [],
    );
  }

  // Return true if `dependency` reads props that the graph fills into the
  // model it depends on: the keys of a relation, or the value of a `#ref{}`.
  // The other props of existing models are known right away, but these only
  // once they're filled in (#356). A `#ref` model is the model it refers to,
  // so its relations wait for the props filled into that model.
  readsFilledProps(dependency) {
    const { node, relation, reference } = dependency;
    const filledProps = this.getFilledProps(node.referencedNode || node);
    const readProps = relation
      ? getKeyProps(dependency, node)
      : reference
        ? [reference.refPath[0]]
        : [];
    return readProps.some((prop) => filledProps.includes(prop));
  }

  // Return true if `node` waits for the keys or references of inserted models,
  // also through the models that it references (#356), and through the models
  // whose keys it reads once the graph fills them in.
  _waitsForInserts(node, visitedNodes = new Set()) {
    const { actions } = this.plan;
    visitedNodes.add(node);
    return (this.dependencies.get(node) || []).some((dependency) => {
      const { node: dependencyNode, relation } = dependency;
      const referencedNode = dependencyNode.referencedNode || dependencyNode;
      return (
        actions.get(referencedNode) === 'insert' ||
        ((!relation || this.readsFilledProps(dependency)) &&
          !visitedNodes.has(referencedNode) &&
          this._waitsForInserts(referencedNode, visitedNodes))
      );
    });
  }

  // Return true if the model of the `#ref` model `node` writes what `node`
  // would write to the row: The model is inserted, or it's written and its path
  // allows any write that the path of `node` allows.
  isCoveredByModel(node) {
    const { actions, graphOptions } = this.plan;
    const { referencedNode } = node;
    const action = actions.get(referencedNode);
    const allowsWrite = (node) => graphOptions.shouldPatch(node) || graphOptions.shouldUpdate(node);
    return (
      action === 'insert' ||
      (['relate', 'patch'].includes(action) && (allowsWrite(referencedNode) || !allowsWrite(node)))
    );
  }

  // Return true if `node` is a `#ref` model whose model writes all that it would
  // write, as its place keeps nothing of its own: It's a BelongsToOne model, or
  // it's placed where its model is. Many-to-many models write their join rows.
  _isWrittenByModel(node) {
    const { referencedNode, relation, parent } = node;
    return (
      !!referencedNode &&
      (relation.keySide === 'owner' ||
        (relation.keySide === 'related' &&
          referencedNode.relation === relation &&
          referencedNode.parent === parent)) &&
      this.isCoveredByModel(node)
    );
  }

  // Map the nodes whose rows reference each other through the keys and values
  // that they write, also through the rows of other nodes, to the first node of
  // their cycle: the strongly connected components of these references, found
  // with Tarjan's algorithm.
  findReferenceCycles(nodes) {
    const getRow = (node) => node.referencedNode || node;
    const nodesByRow = groupBy(nodes, getRow);
    const getReferencedNodes = (node) =>
      (this.dependencies.get(node) || [])
        .flatMap((dependency) => nodesByRow.get(getRow(dependency.node)) || [])
        .filter((referencedNode) => referencedNode !== node);

    const indices = new Map();
    const lowLinks = new Map();
    const stack = [];
    const stackedNodes = new Set();
    const cycles = new Map();

    const visit = (node) => {
      indices.set(node, indices.size);
      lowLinks.set(node, indices.get(node));
      stack.push(node);
      stackedNodes.add(node);

      for (const referencedNode of getReferencedNodes(node)) {
        if (!indices.has(referencedNode)) {
          visit(referencedNode);
          lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(referencedNode)));
        } else if (stackedNodes.has(referencedNode)) {
          lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(referencedNode)));
        }
      }

      // `node` is the first node of a component, which holds the nodes above
      // it on the stack:
      if (lowLinks.get(node) === indices.get(node)) {
        const componentNodes = stack.splice(stack.lastIndexOf(node));

        for (const componentNode of componentNodes) {
          stackedNodes.delete(componentNode);

          if (componentNodes.length > 1) {
            cycles.set(componentNode, node);
          }
        }
      }
    };

    for (const node of nodes) {
      if (!indices.has(node)) {
        visit(node);
      }
    }

    return cycles;
  }
}

// Collect what each node waits for: The node on the other side of its relation
// if the node stores its keys, and the nodes it references with `#ref` and
// `#ref{}`.
function createDependencies(plan) {
  const { actions } = plan;
  const dependencies = new Map();

  const addDependency = (dependent, dependency) => {
    const nodeDependencies = dependencies.get(dependent);
    const entry = { dependent, ...dependency };

    if (nodeDependencies) {
      nodeDependencies.push(entry);
    } else {
      dependencies.set(dependent, [entry]);
    }
  };

  for (const node of plan.activeNodes) {
    const { parent, relation } = node;

    // Models marked with `#unrelate` or `#delete` are never inserted or related,
    // so their keys aren't copied. Ignored models don't replace the current one,
    // so their keys aren't copied to their owners either.
    if (parent && !node.toBeUnrelatedOrDeleted) {
      if (relation.keySide === 'related') {
        addDependency(node, { node: parent, relation, related: node });
      } else if (relation.keySide === 'owner' && actions.get(node) !== 'ignore') {
        addDependency(parent, { node, relation, related: node });
      }
    }
  }

  for (const node of plan.activeNodes) {
    if (node.referencedNode) {
      addDependency(node, { node: node.referencedNode });
    }

    for (const reference of node.propertyReferences) {
      addDependency(node, { node: reference.referencedNode, reference });
    }

    // A missing row that the graph inserts elsewhere is related once it is:
    const insertingNode =
      node.isMissing && actions.get(node) === 'relate' && plan.findInsertingNode(node);

    if (insertingNode) {
      addDependency(node, { node: insertingNode });
    }

    // A row that goes into the slot of a HasOneRelation waits for the relate
    // that moves the current row out of it, as the foreign key may be unique.
    const moverNode = getSlotMover(plan, node);

    if (moverNode) {
      addDependency(node, { node: moverNode, isSlotMove: true });
    }
  }

  return dependencies;
}

// Find the relate that moves the current row in the slot of the HasOneRelation
// that `node` is inserted or related into to another owner.
function getSlotMover(plan, node) {
  const { actions } = plan;
  const slotNode = ['insert', 'relate'].includes(actions.get(node)) && getSlotNode(node);
  const keptNode = slotNode && plan.keptNodeForRow(slotNode);
  return keptNode && actions.get(keptNode) === 'relate' ? keptNode : null;
}

// Find the current row in the slot of the HasOneRelation that `node` relates
// or is inserted into, or null if it's in another relation or an empty slot.
function getSlotNode(node) {
  const { relation } = node;
  return relation?.keySide === 'related' && relation.isOneToOne()
    ? (node.parent.existing?.activeChildren.find(
        (child) => child.relation.name === relation.name,
      ) ?? null)
    : null;
}

// Return the key props of `node` on its side of the relation of `dependency`.
function getKeyProps({ relation, related }, node) {
  return (related === node ? relation.relatedProp : relation.ownerProp).props;
}
