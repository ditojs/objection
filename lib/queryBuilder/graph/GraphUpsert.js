import { GraphNode, createNotModelError } from './GraphNode.js';
import { GraphOptions } from './GraphOptions.js';
import { GraphPlan } from './GraphPlan.js';
import { GraphKeys } from './graphKeys.js';
import { GraphSchedule } from './GraphSchedule.js';
import { GraphWriter } from './GraphWriter.js';
import { getReadKeys, loadCurrentGraph } from './GraphLoader.js';
import {
  checkChangedIds,
  checkGraph,
  checkJoinTables,
  checkMissingModels,
  checkPlacements,
  checkReadKeys,
  checkReferenceCycles,
  checkReferences,
} from './graphChecks.js';
import { asArray, isObject } from '../../utils/objectUtils.js';

export class GraphUpsert {
  constructor({ rootModelClass, objects, upsertOptions, insertOnly = false }) {
    // Wrap `undefined` too, so that it fails the check:
    for (const obj of Array.isArray(objects) ? objects : [objects]) {
      if (!isObject(obj)) {
        throw createNotModelError(rootModelClass, obj);
      }
    }

    this.objects = rootModelClass.ensureModelArray(objects, GraphUpsert.modelOptions);
    this.isArray = Array.isArray(objects);
    this.graphOptions = new GraphOptions(upsertOptions, insertOnly);
  }

  static get modelOptions() {
    return { skipValidation: true };
  }

  // A graph is written using many insert queries (one per batch and table),
  // so there's no single insert query an `onConflict` clause could be applied
  // to. Even applying it to the root table only would be unsound: rows skipped
  // by `ignore()` aren't returned, which leaves the root models without ids,
  // so that related rows would be inserted with missing or wrong foreign keys.
  static checkForOnConflict(builder, method) {
    if (builder.has(isOnConflictOperation)) {
      throw new Error(
        `onConflict(), ignore() and merge() are not supported by ${method}(). ` +
          'Insert the conflicting rows with a separate insert() query instead.',
      );
    }
  }

  async run(builder) {
    const { graphOptions } = this;
    const nodes = GraphNode.buildGraph(builder.modelClass(), this.roots);
    GraphNode.linkReferences(nodes);
    const restoreMarkers = GraphNode.removeMarkers(nodes);

    for (const node of nodes) {
      if (node.parent && node.isDbReference) {
        node.relation.setRelateProp(node.obj, asArray(node.dbReference));
      }
    }

    // A `#ref` to a model with an id is that model, also when its relations
    // are loaded and upserted:
    for (const { obj, referencedNode } of nodes) {
      if (referencedNode?.obj.$hasId() && !obj.$hasId()) {
        obj.$id(referencedNode.obj.$id());
      }
    }

    try {
      const plan = new GraphPlan({ nodes, graphOptions });
      checkGraph(builder, plan);
      checkPlacements(builder, nodes);
      checkReferenceCycles(nodes);
      const isUpsert = !graphOptions.isInsertOnly();
      const load = async (readKeys) => {
        if (isUpsert) {
          await loadCurrentGraph(builder, plan, readKeys);
        }

        plan.plan();
        return new GraphKeys(plan);
      };

      // The relations of rows whose keys change are read again at the keys that
      // the graph gives them, and the graph is planned with them:
      let keys = await load();
      const readKeys = isUpsert ? getReadKeys(plan, keys) : null;

      if (readKeys) {
        keys = await load(readKeys);
      }

      checkMissingModels(builder, plan);

      if (readKeys) {
        checkReadKeys(keys, readKeys);
      }

      checkChangedIds(builder, plan);
      checkReferences(builder, plan);
      checkJoinTables(builder, plan);
      await new GraphWriter(new GraphSchedule(plan, keys)).write(builder);
    } catch (err) {
      // The input can be retried as it was:
      restoreMarkers();
      throw err;
    }

    return this.roots;
  }

  get roots() {
    return this.isArray ? this.objects : this.objects[0];
  }
}

function isOnConflictOperation(operation) {
  return ['onConflict', 'ignore', 'merge'].includes(operation.name);
}
