import { getModel } from '../../model/getModel.js';
import { restoreOmitFromDatabaseJson } from '../../model/modelUtils.js';
import { valuesKey } from '../../model/modelValues.js';
import { UpdateOperation } from '../operations/UpdateOperation.js';
import { getMaxRows, hasBatchInsert } from '../../utils/knexUtils.js';
import { isInternalProp } from '../../utils/internalPropUtils.js';
import { chunk, difference, groupBy, isObject, nonStrictEquals } from '../../utils/objectUtils.js';
import { map as promiseMap } from '../../utils/promiseUtils/index.js';
import {
  clearKeysOfRemovedRows,
  fetchGeneratedKeys,
  getChangedKeysOfRelatedRows,
  isOtherKey,
  resolveDependencies,
  resolveFilledDependencies,
  resolveReference,
  setKeyArrays,
} from './graphKeys.js';

const MAX_INSERT_BATCH_SIZE = 100;
const MAX_CONCURRENCY = 100;

// Write a planned graph in the steps of its `GraphSchedule`.
export class GraphWriter {
  constructor(schedule) {
    this.schedule = schedule;
    this.plan = schedule.plan;
  }

  async write(builder) {
    // Fill in the keys that are known before the writes. Inserted models get
    // theirs right before their insert:
    for (const node of this.plan.activeNodes) {
      if (this.plan.actions.get(node) !== 'insert') {
        this.schedule.keys.fill(node);
      }
    }

    for (const step of this.schedule.steps) {
      await this._writeStep(builder, step);
    }

    // `#ref` models return the props of the models they refer to:
    for (const node of this.plan.activeNodes) {
      resolveReference(node);
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

  _move(builder, nodes) {
    for (const node of nodes) {
      resolveFilledDependencies(this.schedule, node);
    }

    this._leaveSlots(nodes);
    return this._patch(builder, nodes);
  }

  // Rows that swap slots in a cycle leave their slots empty first, and take
  // their keys once the others moved, see `_writeDeferredKeys()`:
  _leaveSlots(nodes) {
    for (const { dependent, isSlotMove } of this.schedule.deferredDependencies) {
      if (isSlotMove && nodes.includes(dependent)) {
        const { relatedProp } = dependent.relation;
        relatedProp.forEach((i) => relatedProp.setProp(dependent.obj, i, null));
      }
    }
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
          const owners = [...new Set(groupNodes.map((node) => node.parent))].map((parent) =>
            getRelationOwner(this.schedule.keys, parent.node, parent.obj, relation),
          );
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
    const slotMovedNodes = nodes.filter((node) => this.schedule.slotMovedNodes.has(node));
    this._leaveSlots(slotMovedNodes);
    await this._patch(builder, slotMovedNodes);

    for (const node of references) {
      resolveDependencies(this.schedule, node);
    }
  }

  async _insertBatch(builder, nodes) {
    const { actions } = this.plan;

    for (const node of nodes) {
      resolveDependencies(this.schedule, node);

      // Join table extras are written to the join rows.
      if (node.relation?.keySide === 'join') {
        node.relation.omitExtraProps([node.obj]);
      }

      if (actions.get(node) === 'insert') {
        setKeyArrays(this.plan, node);
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
      this.schedule.keys.setInserted(insertNodes);
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

        this.schedule.keys.fill(owner);

        // A row that swaps slots gets its own key, others the key of their
        // BelongsToOne row:
        for (const { relation, isSlotMove } of dependencies) {
          const prop = isSlotMove ? owner.relation.relatedProp : relation.ownerProp;
          prop.forEach((i) => prop.patch(patch, i, prop.getProp(owner.obj, i)));
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
      // Each pair of models has one join row, which gets the extras of all
      // places of the pair:
      const joinRows = new Map();

      for (const node of joinNodes) {
        const { relation, parent } = node;
        resolveReference(node);

        const ownerKeys = this.schedule.keys.getProps(parent, relation.ownerProp);
        const key = `${relation.name}:${valuesKey(ownerKeys)}:${relation.relatedProp.propKey(node.obj)}`;
        const row = relation.createJoinModel(ownerKeys, node.obj);
        joinRows.set(key, { relation, row: { ...row, ...joinRows.get(key)?.row } });
      }

      const objs = await Promise.all(
        [...joinRows.values()].map(async ({ relation, row }) => {
          const obj = joinModelClass.fromJson(row);
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
      const cycles = this.schedule.findReferenceCycles(patches.map(({ node }) => node));
      // Patches whose rows reference each other lock them in opposite order
      // when they run at the same time, which deadlocks on MySQL. We write the
      // patches of each cycle one after the other (#385):
      const groups = groupBy(patches, ({ node }) => cycles.get(node) || node);
      await promiseMap(
        [...groups.values()],
        async (patches) => {
          for (const patch of patches) {
            await this._writePatch(builder, patch);
          }
        },
        { concurrency: getConcurrency(builder, nodes) },
      );
    } finally {
      for (const [node, props] of omittedProps) {
        restoreOmitFromDatabaseJson(node.obj, props);
      }
    }
  }

  // Find out what to write for `node`, validate it, and return the patch, or
  // nothing if there is nothing to write.
  _preparePatch(builder, node) {
    const { referencedNode } = node;

    // The props that the graph fills into the model of a `#ref` model are only
    // final now:
    if (referencedNode) {
      resolveReference(node, this.schedule.getFilledProps(referencedNode));
    }

    const { graphOptions } = this.plan;
    const shouldPatch = graphOptions.shouldPatch(node);
    const shouldUpdate = graphOptions.shouldUpdate(node);
    // Inserts, relates and removals of BelongsToOne rows change the keys of
    // their owners, and relates into other relations the keys of the related
    // rows, which are written even with `noUpdate` (#53):
    const keyProps = [
      ...getChangedKeysOfRelatedRows(this.plan, this.schedule.keys, node),
      ...clearKeysOfRemovedRows(this.plan, node),
      ...setKeyArrays(this.plan, node),
      ...(this.plan.actions.get(node) === 'relate' && node.relation.keySide === 'related'
        ? node.relation.relatedProp.props
        : []),
    ];
    // Changing the id never makes sense with `upsertGraph()`. A many-to-many
    // `#ref` model whose model writes its row only writes its join row:
    const idProps = node.modelClass.getIdPropertyArray();
    const isJoinRowOnly =
      !!referencedNode && node.relation.keySide === 'join' && this.plan.isCoveredByModel(node);
    const isWritable = (prop) =>
      !idProps.includes(prop) &&
      !this.schedule.keys.isOnlyRead(node, prop) &&
      (!isJoinRowOnly || node.relation.joinTableExtras.some((extra) => extra.aliasProp === prop));

    const getPropsToUpdate = (changedProps) =>
      (shouldPatch || shouldUpdate ? changedProps : keyProps).filter(isWritable);

    // Leave out the props that don't change, and return true if any do.
    const handleUpdate = ({ changedProps, unchangedProps } = this._findChanges(node)) => {
      const propsToUpdate = getPropsToUpdate(changedProps);

      if (propsToUpdate.length > 0) {
        node.obj.$omitFromDatabaseJson(
          difference([...changedProps, ...unchangedProps], propsToUpdate),
        );
        return true;
      } else {
        return false;
      }
    };

    // Without a `beforeUpdate` or `$beforeUpdate` hook, we know right away
    // what to update. Otherwise, the hook may still change the model, and we
    // check again after it runs, but only if the model has props to update, as
    // relates are no updates (#2233, #2605).
    const changes = this._findChanges(node);
    const propsToUpdate = getPropsToUpdate(changes.changedProps);
    const hasBeforeUpdate = hasHook(node.obj, 'beforeUpdate');

    if (propsToUpdate.length === 0) {
      return null;
    } else if (!hasBeforeUpdate) {
      handleUpdate(changes);
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

    return {
      node,
      shouldPatch,
      hasBeforeUpdate,
      handleUpdate,
      propsToUpdate,
      isPatchedThroughRelation,
    };
  }

  _writePatch(
    builder,
    { node, shouldPatch, hasBeforeUpdate, handleUpdate, propsToUpdate, isPatchedThroughRelation },
  ) {
    const query = (
      isPatchedThroughRelation
        ? getRelationOwner(
            this.schedule.keys,
            node.parent,
            (node.parent.existing || node.parent).obj,
            node.relation,
          )
            .$relatedQuery(node.relation.name)
            .findById(node.obj.$id())
        : (node.current?.obj || node.obj).$query()
    )
      .childQueryOf(builder, { fork: true, isInternalQuery: true })
      // The current graph was fetched through the relations, so the patched
      // models are known to be related to their parents.
      .internalOptions({
        skipRelationFilter: true,
        // Join rows are patched with the extras among the props to update. The
        // extras of new join rows are written with them, see `_findChanges()`:
        joinTableExtras: node.relation?.keySide === 'join' && !node.current ? [] : propsToUpdate,
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

  _findChanges(node) {
    const { obj, relation } = node;
    const currentObj = node.current?.obj || {};
    const relationNames = node.modelClass.getRelationNames();
    // The extras of a new join row are written with it:
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

// Return the owner to find the rows of `relation` through: the current row
// `obj` of the owner, as the graph may leave its keys out, with the final keys
// of `node` if they change, as the relation was read at them.
function getRelationOwner(keys, node, obj, relation) {
  const { ownerProp } = relation;
  const values = keys.getReadProps(node, ownerProp);

  if (isOtherKey(values, ownerProp.getProps(obj))) {
    const owner = obj.$clone({ shallow: true });
    values.forEach((value, i) => {
      if (value !== undefined) {
        ownerProp.setProp(owner, i, value);
      }
    });
    return owner;
  } else {
    return obj;
  }
}

function createPatchNotFoundError(builder, node) {
  return node.modelClass.createNotFoundError(builder.context(), {
    message: `model (id=${node.obj.$id()}) was not found when updating it. An earlier write of the graph or a concurrent query may have deleted it`,
    dataPath: node.dataPath,
  });
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
