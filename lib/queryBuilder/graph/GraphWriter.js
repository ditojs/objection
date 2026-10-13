import { getModel } from '../../model/getModel.js';
import { restoreOmitFromDatabaseJson } from '../../model/modelUtils.js';
import { UpdateOperation } from '../operations/UpdateOperation.js';
import { getMaxRows, hasBatchInsert } from '../../utils/knexUtils.js';
import { isInternalProp } from '../../utils/internalPropUtils.js';
import {
  chunk,
  difference,
  get,
  groupBy,
  isObject,
  jsonEquals,
  nonStrictEquals,
  set,
} from '../../utils/objectUtils.js';
import { map as promiseMap } from '../../utils/promiseUtils/index.js';

const MAX_INSERT_BATCH_SIZE = 100;
const MAX_CONCURRENCY = 100;

// Write a planned graph in steps, in an order that keeps keys and constraints
// intact (#214):
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
export class GraphWriter {
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

  async write(builder) {
    // Fill in the keys that existing models leave out, before new children read them:
    for (const node of this.plan.activeNodes) {
      copyKeysFromExisting(node, this.plan.actions);
    }

    for (const step of this.steps) {
      await this._writeStep(builder, step);
    }

    // `#ref` models return the props of the models they refer to:
    for (const node of this.plan.activeNodes) {
      resolveReference(node);
    }
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
              action === 'patch' ||
              (action === 'relate' && !this.movedNodes.has(node) && !this.slotMovedNodes.has(node))
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

  _writeStep(builder, step) {
    switch (step.kind) {
      case 'move':
        return this._move(builder, step.nodes);
      case 'remove':
        return this._remove(builder, step.nodes, step.areReferenced);
      case 'insert':
        return this._insert(builder, step.nodes, step.references);
      case 'deferredKeys':
        return this._writeDeferredKeys(builder, step.dependencies);
      case 'joinRows':
        return this._insertJoinRows(builder, step.nodes);
      case 'patch':
        return this._patch(builder, step.nodes);
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
          (dependency.isSlotMove || !hasRow(dependency.node) || this._readsFilledProps(dependency)),
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
  _getFilledProps(node) {
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
  _readsFilledProps(dependency) {
    const { node, relation, reference } = dependency;
    const filledProps = this._getFilledProps(node.referencedNode || node);
    const readProps = relation
      ? getKeyProps(dependency, node)
      : reference
        ? [reference.refPath[0]]
        : [];
    return readProps.some((prop) => filledProps.includes(prop));
  }

  // Return true if `node` waits for the keys or references of inserted models,
  // also through the models that it references (#356).
  _waitsForInserts(node, visitedNodes = new Set()) {
    const { actions } = this.plan;
    visitedNodes.add(node);
    return (this.dependencies.get(node) || []).some(({ node: dependencyNode, relation }) => {
      const referencedNode = dependencyNode.referencedNode || dependencyNode;
      return (
        actions.get(referencedNode) === 'insert' ||
        (!relation &&
          !visitedNodes.has(referencedNode) &&
          this._waitsForInserts(referencedNode, visitedNodes))
      );
    });
  }

  _move(builder, nodes) {
    for (const node of nodes) {
      this._resolveDependencies(node);
    }

    return this._patch(builder, nodes);
  }

  _remove(builder, nodes, areReferenced) {
    const { actions } = this.plan;
    const queries = [];

    for (const [relation, relationNodes] of groupBy(nodes, (node) => node.relation)) {
      // Each row binds its id, and the owner keys of its owner at most.
      const maxRows = getMaxRows(
        builder.unsafeKnex(),
        relation.relatedModelClass.getIdColumnArray().length + relation.ownerProp.size,
      );

      for (const [action, actionNodes] of groupBy(relationNodes, (node) => actions.get(node))) {
        // One query would match the ids with all owners, so join rows are
        // removed per owner, and so are unrelated rows, which may have moved
        // from one owner to another before (#214).
        const groups =
          relation.keySide === 'join' || action === 'unrelate'
            ? [...groupBy(actionNodes, (node) => node.parent).values()]
            : [actionNodes];

        for (const groupNodes of groups.flatMap((nodes) => chunk(nodes, maxRows))) {
          // Rows that reference their owners are found through the relation.
          // BelongsToOne rows aren't referenced anymore once their owners are
          // patched.
          const owners = [...new Set(groupNodes.map((node) => node.parent.obj))];
          const query = (
            areReferenced
              ? relation.ownerModelClass.relatedQuery(relation.name).for(owners)
              : relation.relatedModelClass.query()
          )
            .childQueryOf(builder)
            .findByIds(groupNodes.map((node) => node.obj.$id()));

          queries.push(action === 'unrelate' ? query.unrelate() : query.delete());
        }
      }
    }

    return promiseMap(queries, (query) => query.execute(), {
      concurrency: getConcurrency(builder, nodes),
    });
  }

  async _insert(builder, nodes, references) {
    const batchSize = getBatchSize(builder);
    const batches = [...groupBy(nodes, (node) => node.modelClass).values()].flatMap((nodes) =>
      chunk(nodes, batchSize),
    );

    await promiseMap(batches, (batch) => this._insertBatch(builder, batch), {
      concurrency: getConcurrency(builder, nodes),
    });
    await this._patch(
      builder,
      nodes.filter((node) => this.slotMovedNodes.has(node)),
    );

    for (const node of references) {
      this._resolveDependencies(node);
    }
  }

  // Copy the keys and `#ref{}` values that `node` waits for into its model.
  _resolveDependencies(node) {
    for (const dependency of this.dependencies.get(node) || []) {
      if (!this.deferredDependencies.has(dependency)) {
        if (dependency.relation) {
          resolveKeys(dependency.related);
        } else if (dependency.reference) {
          resolvePropertyReference(dependency.dependent, dependency.reference);
        }
      }
    }
  }

  async _insertBatch(builder, nodes) {
    const { actions } = this.plan;

    for (const node of nodes) {
      this._resolveDependencies(node);

      // Join table extras are written to the join rows.
      if (node.relation?.keySide === 'join') {
        node.relation.omitExtraProps([node.obj]);
      }

      if (actions.get(node) === 'insert') {
        this._setKeyArrays(node);
      }
    }

    const insertNodes = nodes.filter((node) => actions.get(node) === 'insert');

    if (insertNodes.length > 0) {
      const [{ modelClass }] = insertNodes;

      for (const node of insertNodes) {
        node.obj.$validate(null, { dataPath: node.dataPathKey });
      }

      await Promise.all(
        insertNodes.map(
          (node) =>
            node.parent && node.relation.beforeInsert(node.obj, builder.context(), node.parent.obj),
        ),
      );

      await modelClass
        .query()
        .insert(insertNodes.map((node) => node.obj))
        .childQueryOf(builder)
        .copyFrom(builder, isReturningAll)
        .execute();

      await fetchGeneratedKeys(builder, modelClass, insertNodes);
    }
  }

  _writeDeferredKeys(builder, dependencies) {
    const owners = groupBy(dependencies, (dependency) => dependency.dependent);

    return promiseMap(
      [...owners],
      ([owner, dependencies]) => {
        const { modelClass } = owner;
        const idProp = modelClass.getIdRelationProperty();
        const patch = {};

        for (const { relation, related } of dependencies) {
          resolveKeys(related);

          relation.ownerProp.forEach((i) => {
            relation.ownerProp.patch(patch, i, relation.ownerProp.getProp(owner.obj, i));
          });
        }

        return modelClass
          .query()
          .childQueryOf(builder)
          .patch(patch)
          .whereInComposite(idProp.refs(builder), [idProp.getProps(owner.obj)]);
      },
      { concurrency: getConcurrency(builder, [...owners.keys()]) },
    );
  }

  async _insertJoinRows(builder, nodes) {
    const knex = builder.unsafeKnex();
    const inserts = [];

    for (const [joinModelClass, joinNodes] of groupBy(nodes, (node) =>
      node.relation.getJoinModelClass(knex),
    )) {
      const objs = await Promise.all(
        joinNodes.map(async (node) => {
          const { relation, parent } = node;
          resolveReference(node);

          const obj = joinModelClass.fromJson(
            relation.createJoinModel(relation.ownerProp.getProps(parent.obj), node.obj),
          );

          await relation.joinTableBeforeInsert(obj, builder.context());
          return obj;
        }),
      );

      // Join rows that have their ids can be inserted in batches everywhere.
      const batchSize = objs.every((obj) => obj.$hasId())
        ? MAX_INSERT_BATCH_SIZE
        : getBatchSize(builder);

      for (const batch of chunk(objs, batchSize)) {
        inserts.push(() => joinModelClass.query().childQueryOf(builder).insert(batch));
      }
    }

    return promiseMap(inserts, (insert) => insert(), {
      concurrency: getConcurrency(builder, nodes),
    });
  }

  async _patch(builder, nodes) {
    // The patches leave out the props that don't change, but the models that
    // the graph returns get them back once the step is written (#371):
    const omittedProps = new Map(nodes.map((node) => [node, node.obj.$omitFromDatabaseJson()]));

    try {
      const patches = nodes.map((node) => this._preparePatch(builder, node)).filter(Boolean);
      await promiseMap(patches, (patch) => this._writePatch(builder, patch), {
        concurrency: getConcurrency(builder, nodes),
      });
    } finally {
      for (const [node, props] of omittedProps) {
        restoreOmitFromDatabaseJson(node.obj, props);
      }
    }
  }

  // Find out what to write for `node`, validate it, and return the patch, or
  // nothing if there is nothing to write.
  _preparePatch(builder, node) {
    const { graphOptions } = this.plan;
    const shouldPatch = graphOptions.shouldPatch(node);
    const shouldUpdate = graphOptions.shouldUpdate(node);
    // Inserts, relates and removals of BelongsToOne rows change the keys of
    // their owners, and relates into other relations the keys of the related
    // rows, which are written even with `noUpdate` (#53):
    const keyProps = [
      ...this._setKeysOfRelatedRows(node),
      ...this._clearKeysOfRemovedRows(node),
      ...this._setKeyArrays(node),
      ...(this.plan.actions.get(node) === 'relate' && node.relation.keySide === 'related'
        ? node.relation.relatedProp.props
        : []),
    ];
    // Changing the id never makes sense with `upsertGraph()`:
    const idProps = node.modelClass.getIdPropertyArray();

    // Leave out the props that don't change, and return true if any do.
    const handleUpdate = () => {
      const { changedProps, unchangedProps } = this._findChanges(node);
      const propsToUpdate = difference(
        shouldPatch || shouldUpdate ? changedProps : keyProps,
        idProps,
      );

      if (propsToUpdate.length > 0) {
        node.obj.$omitFromDatabaseJson(
          difference([...changedProps, ...unchangedProps], propsToUpdate),
        );
        return true;
      } else {
        return false;
      }
    };

    // Without a `beforeUpdate` or `$beforeUpdate` hook, we know right away if
    // there is anything to update. Otherwise, the hook may still change the
    // model, and we check after it runs, but only if the model has changes
    // that aren't ids, as relates are no updates (#2233, #2605).
    const hasBeforeUpdate = hasHook(node.obj, 'beforeUpdate');

    if (
      hasBeforeUpdate
        ? !this._findChanges(node).changedProps.some((prop) => !idProps.includes(prop))
        : !handleUpdate()
    ) {
      return null;
    }

    node.obj.$validate(null, {
      dataPath: node.dataPathKey,
      patch: shouldPatch || !shouldUpdate,
    });

    // Rows that their owners relate by their keys can't be found through the
    // relation until the owners are patched, so they're patched directly.
    const { relation } = node;
    const isPatchedThroughRelation =
      !!node.parent &&
      (relation.keySide === 'join' ||
        (relation.keySide === 'owner' && this.plan.actions.get(node) !== 'relate'));

    return { node, shouldPatch, hasBeforeUpdate, handleUpdate, isPatchedThroughRelation };
  }

  _writePatch(
    builder,
    { node, shouldPatch, hasBeforeUpdate, handleUpdate, isPatchedThroughRelation },
  ) {
    const query = (
      isPatchedThroughRelation
        ? // Find the row through the keys of the owner's current row, as the
          // graph may leave them out of the owner:
          (node.parent.existing || node.parent).obj
            .$relatedQuery(node.relation.name)
            .findById(node.obj.$id())
        : (node.current?.obj || node.obj).$query()
    )
      .childQueryOf(builder, { fork: true, isInternalQuery: true })
      // The current graph was fetched through the relations, so the patched
      // models are known to be related to their parents.
      .internalOptions({
        skipRelationFilter: true,
        // The extras of new join rows are written with them, see `_findChanges()`:
        skipJoinTableExtras: node.relation?.keySide === 'join' && !node.current,
      })
      .copyFrom(builder, isReturningAll);

    if (hasBeforeUpdate) {
      query.internalContext().runBefore.push((result, query) => {
        if (!handleUpdate()) {
          query.internalOptions().returnImmediatelyValue = null;
        }

        return result;
      });
    }

    return (shouldPatch ? query.patch(node.obj) : query.update(node.obj))
      .runAfter(async (result, query) => {
        if (isObject(result) && result.$isObjectionModel) {
          // Handle `returning('*')`.
          node.obj.$set(result);
        } else if (
          (result === 0 || result === undefined) &&
          // Not if a hook resolved the query, e.g. with `cancelQuery()`, or
          // there was no column to write:
          !query.findOperation(UpdateOperation).isResolvedWithoutWrite(query)
        ) {
          // Rows patched through relations are gone from there if not found.
          if (isPatchedThroughRelation) {
            throw createPatchNotFoundError(builder, node);
          } else {
            await throwForMissingRow(builder, node);
          }
        }

        return result;
      })
      .execute();
  }

  // Change the arrays of keys that `node` holds for the relations that the graph
  // gives it: Remove the keys of the current related rows that it deletes or
  // unrelates, and add the keys of the related models that it writes. Other
  // keys stay, e.g. of rows that the relation's filter leaves out. Relations
  // that the graph leaves out keep their arrays (#1202). Return the props that
  // change.
  _setKeyArrays(node) {
    const { actions, graphOptions } = this.plan;
    const { existing } = node;
    const props = [];

    for (const name of node.modelClass.getRelationNames()) {
      const relation = node.obj[name] !== undefined && node.modelClass.getRelation(name);

      if (relation && hasOwnerKeyArray(relation)) {
        const { ownerProp, relatedProp } = relation;
        const getKey = (related) => relatedProp.getProp(related.obj, 0);
        const keys = relation.getKeys(existing ? existing.obj : node.obj);
        const removed = (existing?.activeChildren || []).filter(
          (child) =>
            child.relation.name === name && ['delete', 'unrelate'].includes(actions.get(child)),
        );
        const added = node.activeChildren.filter(
          (child) =>
            child.relation.name === name &&
            !child.toBeUnrelatedOrDeleted &&
            actions.get(child) !== 'ignore',
        );

        for (const related of added) {
          resolveReference(related);
        }

        const newKeys = relation.changeKeys(keys, {
          add: added.map(getKey),
          remove: removed.map(getKey),
        });

        if (!existing || graphOptions.shouldUpdate(node)) {
          // Inserts and updates write the whole row:
          ownerProp.setProp(node.obj, 0, newKeys);
          props.push(ownerProp.props[0]);
        } else if (!jsonEquals(keys, newKeys)) {
          const patch = relation.createKeysPatch(existing.obj, newKeys);
          Object.assign(node.obj, patch);
          props.push(...Object.keys(patch));
        }
      }
    }

    return props;
  }

  // Point the keys of `node` to its BelongsToOne rows that are inserted or
  // related, and return the props that change.
  _setKeysOfRelatedRows(node) {
    const { actions } = this.plan;
    const props = [];

    for (const child of node.activeChildren) {
      const { relation } = child;

      if (
        hasOwnerKey(relation) &&
        relation.relatedProp.hasProps(child.obj) &&
        // Ignored models don't replace the current one, and models marked with
        // `#unrelate` or `#delete` are handled below.
        actions.get(child) !== 'ignore'
      ) {
        relation.ownerProp.forEach((i) => {
          const currentValue = node.existing && relation.ownerProp.getProp(node.existing.obj, i);
          const value = relation.relatedProp.getProp(child.obj, i);

          if (currentValue != value) {
            relation.ownerProp.setProp(node.obj, i, value);
            props.push(relation.ownerProp.props[i]);
          }
        });
      }
    }

    return props;
  }

  // Clear the keys of `node` that point to BelongsToOne rows that are removed,
  // and return the props that change.
  _clearKeysOfRemovedRows(node) {
    const { actions } = this.plan;
    const props = [];

    for (const currentChild of node.existing?.activeChildren || []) {
      const { relation } = currentChild;

      if (
        hasOwnerKey(relation) &&
        (node.obj[relation.name] === null || currentChild.node?.toBeUnrelatedOrDeleted) &&
        actions.get(currentChild) !== 'keep'
      ) {
        relation.ownerProp.forEach((i) => {
          if (relation.ownerProp.getProp(node.existing.obj, i) != null) {
            relation.ownerProp.setProp(node.obj, i, null);
            props.push(relation.ownerProp.props[i]);
          }
        });
      }
    }

    return props;
  }

  _findChanges(node) {
    const { obj, relation } = node;
    const currentObj = node.current?.obj || {};
    const relationNames = node.modelClass.getRelationNames();
    // The extras of a new join row are written with it, and patching them
    // would overwrite other join rows of the same models (Vincit#1268):
    const extraProps =
      relation?.keySide === 'join' && !node.current
        ? relation.joinTableExtras.map((extra) => extra.aliasProp)
        : [];
    const changedProps = [];
    const unchangedProps = [];

    for (const prop of Object.keys(obj)) {
      if (!isInternalProp(prop) && !relationNames.includes(prop)) {
        const value = obj[prop];
        const currentValue = currentObj[prop];

        // We can't know if a prop that the current model doesn't have changes,
        // so we assume it does (#732).
        if (
          !extraProps.includes(prop) &&
          (currentValue === undefined || !nonStrictEquals(currentValue, value))
        ) {
          changedProps.push(prop);
        } else {
          unchangedProps.push(prop);
        }
      }
    }

    // Query properties may change the values too.
    if (obj.$$queryProps) {
      changedProps.push(...Object.keys(obj.$$queryProps));
    }

    return { changedProps, unchangedProps };
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

// Fetch the keys that the relations of the inserted nodes need, but that the
// database generated and the insert didn't return, like a uuid that isn't the
// id (Vincit#853).
async function fetchGeneratedKeys(builder, modelClass, nodes) {
  const keyProps = (node) => [
    ...(node.relation && node.relation.keySide !== 'related' ? [node.relation.relatedProp] : []),
    ...node.activeChildren
      .filter((child) => child.relation.keySide !== 'owner')
      .map((child) => child.relation.ownerProp),
  ];
  const missingNodes = nodes.filter((node) =>
    keyProps(node).some((prop) => prop.getProps(node.obj).some((value) => value === undefined)),
  );

  if (missingNodes.length > 0 && missingNodes.every((node) => node.obj.$hasId())) {
    const columns = [
      ...new Set(missingNodes.flatMap((node) => keyProps(node)).flatMap((prop) => prop.cols)),
    ];
    const rows = await modelClass
      .query()
      .childQueryOf(builder, { fork: true, isInternalQuery: true })
      .findByIds(missingNodes.map((node) => node.obj.$id()))
      .select([...modelClass.getIdColumnArray(), ...columns]);
    const rowsByKey = new Map(rows.map((row) => [row.$idKey(), row]));

    for (const node of missingNodes) {
      const row = rowsByKey.get(node.obj.$idKey());

      for (const prop of keyProps(node)) {
        prop.forEach((i) => {
          if (prop.getProp(node.obj, i) === undefined) {
            prop.setProp(node.obj, i, prop.getProp(row, i));
          }
        });
      }
    }
  }
}

// Copy the keys of the relation of `node` to the side that stores them,
// whichever node was inserted first (#311).
function resolveKeys(node) {
  const { relation, parent } = node;

  // The arrays of keys of owners are written by `_setKeyArrays()`.
  if (relation.keySide === 'related' || hasOwnerKey(relation)) {
    const { ownerProp, relatedProp } = relation;
    const [source, sourceProp, target, targetProp] =
      relation.keySide === 'owner'
        ? [node, relatedProp, parent, ownerProp]
        : [parent, ownerProp, node, relatedProp];

    resolveReference(source);
    resolveReference(target);

    targetProp.forEach((i) => {
      targetProp.setProp(target.obj, i, sourceProp.getProp(source.obj, i));
    });
  }
}

// Give a `#ref` model the props of the model it refers to.
function resolveReference(node) {
  const { referencedNode } = node;

  if (referencedNode) {
    for (const prop of Object.keys(referencedNode.obj)) {
      if (!Object.hasOwn(node.obj, prop)) {
        node.obj[prop] = referencedNode.obj[prop];
      }
    }
  }
}

// Replace a `#ref{}` in a prop of `node` with the value it refers to. A whole
// value is replaced even if the relation set the prop already (Vincit#1378).
function resolvePropertyReference(node, { path, match, refPath, isWholeValue, referencedNode }) {
  const value = get(referencedNode.obj, refPath);
  set(node.obj, path, isWholeValue ? value : get(node.obj, path).replace(match, value));
}

// Fill in the keys of `node` that the graph leaves out from its row: the keys
// that its related models read from wherever the row was found, and the key
// of its parent relation only from its row in the same place. The keys that it
// holds for the BelongsToOne rows that the graph writes come from the graph.
function copyKeysFromExisting(node, actions) {
  const { existing, current } = node;

  if (existing) {
    const copies = [
      ...(node.parent && current ? [[node.relation.relatedProp, current]] : []),
      ...node.activeChildren
        .filter(
          (child) =>
            !hasOwnerKeyArray(child.relation) &&
            (child.relation.keySide !== 'owner' || actions.get(child) === 'ignore'),
        )
        .map((child) => [child.relation.ownerProp, existing]),
    ];

    for (const [prop, source] of copies) {
      prop.forEach((i) => {
        if (prop.getProp(node.obj, i) === undefined) {
          prop.setProp(node.obj, i, prop.getProp(source.obj, i));
        }
      });
    }
  }
}

function hasHook(obj, name) {
  const Model = getModel();
  return obj.constructor[name] !== Model[name] || obj[`$${name}`] !== Model.prototype[`$${name}`];
}

// Throw if the patched row of `node` doesn't exist anymore, e.g. deleted
// through `ON DELETE CASCADE` by an earlier write of the graph. A row that still
// exists counts as patched, even if a trigger skipped it, or MySQL didn't count
// it as changed.
async function throwForMissingRow(builder, node) {
  const { modelClass } = node;
  const row = await modelClass
    .query()
    .childQueryOf(builder, { fork: true, isInternalQuery: true })
    .findById(node.obj.$id())
    .select(modelClass.getIdColumnArray());

  if (!row) {
    throw createPatchNotFoundError(builder, node);
  }
}

function createPatchNotFoundError(builder, node) {
  return node.modelClass.createNotFoundError(builder.context(), {
    message: `model (id=${node.obj.$id()}) was not found when updating it. An earlier write of the graph or a concurrent query may have deleted it`,
    dataPath: node.dataPath,
  });
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

function hasOwnerKey(relation) {
  return relation.keySide === 'owner' && relation.isOneToOne();
}

function hasOwnerKeyArray(relation) {
  return relation.keySide === 'owner' && !relation.isOneToOne();
}

function getBatchSize(builder) {
  return hasBatchInsert(builder.unsafeKnex()) ? MAX_INSERT_BATCH_SIZE : 1;
}

function getConcurrency(builder, nodes) {
  const knex = builder.unsafeKnex();
  return nodes.reduce(
    (concurrency, node) => Math.min(concurrency, node.modelClass.getConcurrency(knex)),
    MAX_CONCURRENCY,
  );
}

function isReturningAll(operation) {
  return operation.name === 'returning' && operation.args.includes('*');
}
