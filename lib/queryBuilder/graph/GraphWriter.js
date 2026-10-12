import { getModel } from '../../model/getModel.js';
import { raw } from '../RawBuilder.js';
import { getDeclaredColumns } from '../operations/fieldExpressions.js';
import { isFieldExpressionKey } from '../../utils/parseFieldExpression.js';
import { getMaxRows, hasBatchInsert, hasBatchInsertDefaults } from '../../utils/knexUtils.js';
import { isInternalProp } from '../../utils/internalPropUtils.js';
import {
  asArray,
  chunk,
  difference,
  get,
  groupBy,
  isObject,
  isPlainObject,
  jsonEquals,
  set,
} from '../../utils/objectUtils.js';
import { map as promiseMap } from '../../utils/promiseUtils/index.js';

const MAX_INSERT_BATCH_SIZE = 100;
const MAX_BULK_PATCH_SIZE = 500;
const MAX_CONCURRENCY = 100;

// Write a planned graph in steps, in an order that keeps keys and constraints
// intact (#214):
// 1. Move the rows that the graph relates to existing owners of HasMany and
//    HasOne relations, as they may still sit below rows that the next step
//    deletes. Rows that wait for inserts are patched again in step 4.
// 2. Remove rows that reference their owners, before the inserts that may need
//    their unique keys.
// 3. Insert the new rows in the order of their keys and references, then the
//    keys deferred to break cycles and the join rows.
// 4. Patch the changed rows, the relates, and the keys of owners whose
//    BelongsToOne rows were inserted, related or removed.
// 5. Remove the BelongsToOne rows that the owners no longer reference.
// `insertGraph()` only inserts.
export class GraphWriter {
  constructor(plan) {
    this.plan = plan;
    // The nodes that each node waits for, through its keys or its references:
    this.dependencies = createDependencies(plan);
    // Dependencies that are written after the inserts, to break cycles:
    this.deferredDependencies = new Set();
    // Relates whose rows are moved to their new owners before the removals, and
    // of those the rows that wait for inserts, which are patched again after:
    this.movedNodes = new Set(
      plan.graphOptions.isInsertOnly()
        ? []
        : plan.activeNodes.filter((node) => this._isMovedFirst(node)),
    );
    this.waitingMovedNodes = new Set(
      [...this.movedNodes].filter((node) => this._waitsForInserts(node)),
    );
    this.steps = this._planSteps();
  }

  async write(builder) {
    // Fill in the keys that existing models leave out, before new children read them:
    for (const node of this.plan.activeNodes) {
      copyKeysFromExisting(node);
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
      ...this._planInsertLevels().map((level) => ({ kind: 'insert', ...level })),
      { kind: 'deferredKeys', dependencies: [...this.deferredDependencies] },
      {
        kind: 'joinRows',
        nodes: activeNodes.filter(
          (node) =>
            node.relation?.keySide === 'join' &&
            !node.current &&
            ['insert', 'relate'].includes(actions.get(node)),
        ),
      },
    ];

    if (graphOptions.isInsertOnly()) {
      return insertSteps;
    } else {
      const removedNodes = activeCurrentNodes.filter((node) => actions.get(node) !== 'keep');
      const isReferencedByOwner = (currentNode) => currentNode.relation.keySide === 'owner';

      return [
        ...this._planSlotRounds([...this.movedNodes]).map((nodes) => ({ kind: 'move', nodes })),
        {
          kind: 'remove',
          nodes: removedNodes.filter((node) => !isReferencedByOwner(node)),
          areReferenced: true,
        },
        ...insertSteps,
        ...this._planSlotRounds(
          activeNodes.filter((node) => {
            const action = actions.get(node);
            return (
              action === 'patch' ||
              (action === 'relate' &&
                (!this.movedNodes.has(node) || this.waitingMovedNodes.has(node)))
            );
          }),
        ).map((nodes) => ({ kind: 'patch', nodes })),
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

  // Group the nodes into levels that can be inserted once the levels before
  // them are: Nodes wait for the nodes whose keys they store and the nodes
  // that they reference. All nodes take part, so that the keys of the nodes
  // that aren't inserted are resolved in order too.
  _planInsertLevels() {
    const nodes = this.plan.activeNodes;
    const handledNodes = new Set();
    const levels = [];

    const getPendingDependencies = (node) =>
      (this.dependencies.get(node) || []).filter(
        (dependency) =>
          !this.deferredDependencies.has(dependency) &&
          !handledNodes.has(dependency.node) &&
          !dependency.node.current,
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
    // the referenced model is inserted. Without `#ref`, the graph is a tree.
    const breakCycle = () => {
      for (const node of nodes) {
        if (!handledNodes.has(node)) {
          for (const dependency of getPendingDependencies(node)) {
            if (this._canDefer(dependency, node) && isBlockedBy(dependency.node, node)) {
              this.deferredDependencies.add(dependency);
              return true;
            }
          }
        }
      }

      return false;
    };

    const isReady = (node) => !handledNodes.has(node) && getPendingDependencies(node).length === 0;
    const isReadyReference = (node) => node.isReference && isReady(node);

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
  // get their ids from the inserts, and a relate into the slot of a HasOne row
  // waits for the removal of that row, or its move, as its key may be unique.
  _isMovedFirst(node, visitedNodes = new Set()) {
    const { actions } = this.plan;
    visitedNodes.add(node);

    if (
      actions.get(node) === 'relate' &&
      !node.isReference &&
      node.relation.keySide === 'related' &&
      node.parent.existing
    ) {
      const slotNode = getSlotNode(node);
      const moverNode = this._getSlotMover(node, slotNode);
      return (
        !(slotNode && actions.get(slotNode) !== 'keep') &&
        // Swapped rows are related together:
        (!moverNode || visitedNodes.has(moverNode) || this._isMovedFirst(moverNode, visitedNodes))
      );
    } else {
      return false;
    }
  }

  // Find the relate that moves the current row in the slot of the
  // HasOneRelation that `node` relates into to another owner.
  _getSlotMover(node, slotNode = this.plan.actions.get(node) === 'relate' && getSlotNode(node)) {
    const { actions } = this.plan;
    const keptNode = slotNode && this.plan.keptNodeForRow(slotNode);
    return keptNode && actions.get(keptNode) === 'relate' ? keptNode : null;
  }

  // Split the nodes into rounds, so that a relate into the slot of a
  // HasOneRelation runs after the relate that moves the row in it to another
  // owner, as the foreign key may be unique.
  _planSlotRounds(nodes) {
    const moverNodes = new Map(nodes.map((node) => [node, this._getSlotMover(node)]));
    const pendingNodes = new Set(nodes);
    const rounds = [];

    while (pendingNodes.size > 0) {
      const readyNodes = [...pendingNodes].filter(
        (node) => !pendingNodes.has(moverNodes.get(node)),
      );
      // Swapped rows can't be ordered, so we relate them together:
      const round = readyNodes.length > 0 ? readyNodes : [...pendingNodes];
      rounds.push(round);

      for (const node of round) {
        pendingNodes.delete(node);
      }
    }

    return rounds;
  }

  // Return true if `node` waits for the keys or references of inserted models.
  _waitsForInserts(node) {
    const { actions } = this.plan;
    return (this.dependencies.get(node) || []).some(
      (dependency) => actions.get(dependency.node.referencedNode || dependency.node) === 'insert',
    );
  }

  async _move(builder, nodes) {
    const [waitingNodes, otherNodes] = partition(nodes, (node) => this.waitingMovedNodes.has(node));

    for (const node of otherNodes) {
      this._resolveDependencies(node);
    }

    await this._patch(builder, otherNodes);
    await promiseMap(waitingNodes, (node) => this._moveWaiting(builder, node), {
      concurrency: getConcurrency(builder, waitingNodes),
    });
  }

  // Move a row that waits for inserts with what is known of it before them,
  // through a model of its own, as `node.obj` is patched once they're written.
  async _moveWaiting(builder, node) {
    const { graphOptions } = this.plan;
    const { modelClass, relation } = node;
    const idProps = modelClass.getIdPropertyArray();
    // Leave out the keys that its related models give it, and all references:
    const waitingProps = (this.dependencies.get(node) || []).flatMap((dependency) =>
      dependency.reference
        ? [dependency.reference.path[0]]
        : dependency.relation && dependency.related !== node
          ? dependency.relation.ownerProp.props
          : [],
    );
    resolveKeys(node);
    const props =
      graphOptions.shouldPatch(node) || graphOptions.shouldUpdate(node)
        ? difference(this._findChanges(node).changedProps, [...idProps, ...waitingProps])
        : relation.relatedProp.props;
    // Give the hooks the ids, but don't write them, and don't parse the values
    // again with `fromJson()`:
    const model = Object.assign(new modelClass(), pick(node.obj, [...idProps, ...props]));
    model.$omitFromDatabaseJson(idProps);
    const count = await modelClass
      .query()
      .childQueryOf(builder)
      .patch(model)
      .findById(node.obj.$id());

    if (!count) {
      await throwForMissingRows(builder, modelClass, [node]);
    }
  }

  _remove(builder, nodes, areReferenced) {
    const { actions } = this.plan;
    const queries = [];

    for (const [relation, relationNodes] of groupBy(nodes, (node) => node.relation)) {
      // Join rows are removed per owner, as one query would remove the rows of
      // all owners with all related rows.
      const groups =
        relation.keySide === 'join'
          ? [...groupBy(relationNodes, (node) => node.parent).values()]
          : [relationNodes];

      for (const groupNodes of groups) {
        // Each row binds its id, and the owner keys of its owner at most.
        const maxRows = getMaxRows(
          builder.unsafeKnex(),
          relation.relatedModelClass.getIdColumnArray().length + relation.ownerProp.size,
        );
        const actionGroups = [...groupBy(groupNodes, (node) => actions.get(node))].flatMap(
          ([action, actionNodes]) => chunk(actionNodes, maxRows).map((nodes) => [action, nodes]),
        );

        for (const [action, actionNodes] of actionGroups) {
          // Rows that reference their owners are found through the relation.
          // BelongsToOne rows aren't referenced anymore once their owners are
          // patched.
          const owners = [...new Set(actionNodes.map((node) => node.parent.obj))];
          const query = (
            areReferenced
              ? relation.ownerModelClass.relatedQuery(relation.name).for(owners)
              : relation.relatedModelClass.query()
          )
            .childQueryOf(builder)
            .findByIds(actionNodes.map((node) => node.obj.$id()));

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

      for (const batch of createBatches(
        builder,
        insertNodes.map((node) => node.obj),
      )) {
        await modelClass
          .query()
          .insert(batch)
          .childQueryOf(builder)
          .copyFrom(builder, isReturningAll)
          .execute();
      }

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

      for (const objsOfBatch of chunk(objs, batchSize)) {
        for (const batch of createBatches(builder, objsOfBatch)) {
          inserts.push(() => joinModelClass.query().childQueryOf(builder).insert(batch));
        }
      }
    }

    return promiseMap(inserts, (insert) => insert(), {
      concurrency: getConcurrency(builder, nodes),
    });
  }

  async _patch(builder, nodes) {
    const patches = nodes.map((node) => this._preparePatch(builder, node)).filter(Boolean);
    const rowKeyCounts = groupBy(patches, ({ node }) => node.rowKey);
    const [bulkPatches, rowPatches] = partition(
      patches,
      (patch) => rowKeyCounts.get(patch.node.rowKey).length === 1 && isBulkPatch(builder, patch),
    );

    await promiseMap(rowPatches, (patch) => this._writePatch(builder, patch), {
      concurrency: getConcurrency(builder, nodes),
    });
    await this._writeBulkPatches(builder, bulkPatches);
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
      .internalOptions({ skipRelationFilter: true })
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
      .execute()
      .then(async (result) => {
        if (isObject(result) && result.$isObjectionModel) {
          // Handle `returning('*')`.
          node.obj.$set(result);
        } else if (result === 0 || result === undefined) {
          // A hook that leaves nothing to update returns null instead. Rows
          // patched through relations are gone from there if not found.
          if (isPatchedThroughRelation) {
            throw createPatchNotFoundError(builder, node);
          } else {
            await throwForMissingRows(builder, node.modelClass, [node]);
          }
        }

        return result;
      });
  }

  // Write the patches of the rows of each table in one query, with a `CASE`
  // per column that picks the value of each row by its id:
  // `SET col = CASE WHEN id = 1 THEN 'a' WHEN id = 2 THEN 'b' ELSE col END`.
  // The column in `ELSE` also gives Postgres the type of the values.
  _writeBulkPatches(builder, patches) {
    const batches = [...groupBy(patches, ({ node }) => node.modelClass)].flatMap(
      ([modelClass, tablePatches]) =>
        chunkByParameters(builder, tablePatches, modelClass.getIdColumnArray()).map((batch) => ({
          modelClass,
          batch,
        })),
    );

    return promiseMap(
      batches,
      async ({ modelClass, batch }) => {
        const idColumns = modelClass.getIdColumnArray();
        const columns = [...new Set(batch.flatMap(({ json }) => Object.keys(json)))];
        const condition = idColumns.map(() => '?? = ?').join(' AND ');
        const update = {};

        for (const column of columns) {
          const rows = batch.filter(({ json }) => column in json);
          const sql = `CASE ${rows.map(() => `WHEN ${condition} THEN ?`).join(' ')} ELSE ?? END`;
          const bindings = rows.flatMap(({ node, json }) => [
            ...idColumns.flatMap((idColumn, i) => [idColumn, asArray(node.obj.$id())[i]]),
            json[column],
          ]);

          update[modelClass.columnNameToPropertyName(column)] = raw(sql, [...bindings, column]);
        }

        // The rows were validated one by one already.
        const nodes = batch.map(({ node }) => node);
        const count = await modelClass
          .query()
          .childQueryOf(builder, { fork: true, isInternalQuery: true })
          .patch(modelClass.fromJson(update, { patch: true, skipValidation: true }))
          .findByIds(nodes.map((node) => node.obj.$id()));

        if (count !== nodes.length) {
          await throwForMissingRows(builder, modelClass, nodes);
        }
      },
      {
        concurrency: getConcurrency(
          builder,
          patches.map(({ node }) => node),
        ),
      },
    );
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
    if (node.referencedNode && !node.referencedNode.isPruned) {
      addDependency(node, { node: node.referencedNode });
    }

    for (const reference of node.propertyReferences) {
      if (!reference.referencedNode.isPruned) {
        addDependency(node, { node: reference.referencedNode, reference });
      }
    }
  }

  return dependencies;
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
// of its relations from wherever the row was found, and the key of its parent
// relation only from its row in the same place.
function copyKeysFromExisting(node) {
  const { existing, current } = node;

  if (existing) {
    const copies = [
      ...(node.parent && current ? [[node.relation.relatedProp, current]] : []),
      ...node.activeChildren
        .filter((child) => !hasOwnerKeyArray(child.relation))
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

// Patches are written in bulk if nothing needs the single model: no update
// hooks, no `returning('*')`, no relation to patch through, and plain values.
function isBulkPatch(builder, patch) {
  const { node, shouldPatch, hasBeforeUpdate, isPatchedThroughRelation } = patch;

  if (
    shouldPatch &&
    !hasBeforeUpdate &&
    !hasHook(node.obj, 'afterUpdate') &&
    !isPatchedThroughRelation &&
    !node.obj.$$queryProps &&
    !builder.has(isReturningAll)
  ) {
    const declaredColumns = getDeclaredColumns(node.modelClass);
    patch.json = node.obj.$toDatabaseJson(builder);

    return Object.entries(patch.json).every(
      ([key, value]) =>
        isPlainValue(value) &&
        // Field expressions like `'meta:a'` write into json columns.
        !isFieldExpressionKey(key, declaredColumns),
    );
  } else {
    return false;
  }
}

function hasHook(obj, name) {
  const Model = getModel();
  return obj.constructor[name] !== Model[name] || obj[`$${name}`] !== Model.prototype[`$${name}`];
}

function isPlainValue(value) {
  return (
    value === null ||
    value instanceof Date ||
    ['string', 'number', 'boolean', 'bigint'].includes(typeof value)
  );
}

// Each row binds its ids and value per column, its ids in the `WHERE` clause,
// and each column its name in `ELSE`.
function chunkByParameters(builder, patches, idColumns) {
  const maxColumns = patches.reduce((max, { json }) => Math.max(max, Object.keys(json).length), 0);
  const parametersPerRow = (idColumns.length + 1) * maxColumns + idColumns.length + maxColumns;
  return chunk(
    patches,
    Math.min(MAX_BULK_PATCH_SIZE, getMaxRows(builder.unsafeKnex(), parametersPerRow)),
  );
}

// Throw for the first row of the patched nodes that doesn't exist anymore, e.g.
// deleted through `ON DELETE CASCADE` by an earlier write of the graph. Rows that
// still exist count as patched, even if a trigger skipped them, or MySQL didn't
// count them as changed.
async function throwForMissingRows(builder, modelClass, nodes) {
  const existingRows = await modelClass
    .query()
    .childQueryOf(builder, { fork: true, isInternalQuery: true })
    .findByIds(nodes.map((node) => node.obj.$id()))
    .select(modelClass.getIdColumnArray());
  const existingKeys = new Set(existingRows.map((row) => row.$idKey()));
  const node = nodes.find((node) => !existingKeys.has(node.obj.$idKey()));

  if (node) {
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
// into, or null if it relates into another relation or an empty slot.
function getSlotNode(node) {
  const { relation } = node;
  return relation.keySide === 'related' && relation.isOneToOne()
    ? (node.parent.existing?.activeChildren.find(
        (child) => child.relation.name === relation.name,
      ) ?? null)
    : null;
}

function hasOwnerKey(relation) {
  return relation.keySide === 'owner' && relation.isOneToOne();
}

function hasOwnerKeyArray(relation) {
  return relation.keySide === 'owner' && !relation.isOneToOne();
}

// Split the models into the batches of rows that can be inserted with one query
// each: Rows without columns can't be inserted in batches (#1694), the rows of
// a batch need the same columns where the database doesn't fill in defaults,
// and the batches need to stay under the number of values a query can bind.
function createBatches(builder, objs) {
  const knex = builder.unsafeKnex();
  const columnsByObj = new Map(objs.map((obj) => [obj, Object.keys(obj.$toDatabaseJson(builder))]));
  // `beforeInsert` hooks may still change the columns, so their rows can only
  // be grouped where the database fills in defaults:
  const getColumnsKey = (obj) =>
    hasBatchInsertDefaults(knex)
      ? ''
      : hasHook(obj, 'beforeInsert')
        ? obj
        : [...columnsByObj.get(obj)].sort().join();
  const batches = [];

  for (const group of groupBy(objs, getColumnsKey).values()) {
    const [rows, emptyRows] = partition(group, (obj) => columnsByObj.get(obj).length > 0);
    const columnCount = Math.max(0, ...rows.map((obj) => columnsByObj.get(obj).length));
    batches.push(...chunk(rows, getMaxRows(knex, columnCount)), ...emptyRows.map((obj) => [obj]));
  }

  return batches;
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

function pick(obj, props) {
  return Object.fromEntries(
    props.filter((prop) => Object.hasOwn(obj, prop)).map((prop) => [prop, obj[prop]]),
  );
}

function partition(items, predicate) {
  return [items.filter(predicate), items.filter((item) => !predicate(item))];
}

function nonStrictEquals(value1, value2) {
  // Only use loose equality for non-JSON values, so that for example `false`
  // and `[]` are not considered equal (#1874).
  return (
    (!isJsonValue(value1) && !isJsonValue(value2) && value1 == value2) || jsonEquals(value1, value2)
  );
}

function isJsonValue(value) {
  return Array.isArray(value) || isPlainObject(value);
}
