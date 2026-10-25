import { beforeAll, afterAll } from 'vitest';
import { GraphOptions } from '../lib/queryBuilder/graph/GraphOptions.js';
import { QueryBuilder } from '../lib/queryBuilder/QueryBuilder.js';
import { isObject } from '../lib/utils/objectUtils.js';

// Converts the options of a non-strict `upsertGraph()` or `insertGraph()` call
// to strict options that give the same writes for `graph`, so that tests written for the old options can check the translation of strict
// mode. The settings are derived per relation path of the graph from what
// `GraphOptions.has()` answers for the old options, one entry per path, since
// combinations of the old options per path can't always be expressed by the
// order of wildcard entries. Returns `null` for options that strict mode can't
// express and for invalid ones, so that the call keeps its own options.
export function toStrictGraphOptions(modelClass, graph, options = {}, insertOnly = false) {
  let graphOptions;

  try {
    graphOptions = new GraphOptions(options, insertOnly);
  } catch {
    return null;
  }

  if (graphOptions.isStrict()) {
    return options;
  }

  const has = (relationPath, optionName) =>
    graphOptions.has({ relationPath, relationPathKey: relationPath.join('.') }, optionName);
  const getSettings = (relationPath) => {
    const settings = {};

    // Strict mode throws for the rows that `noRelate` and `noInsert` skip.
    if (has(relationPath, 'noRelate') || has(relationPath, 'noInsert')) {
      return null;
    }

    if (insertOnly) {
      if (relationPath.length > 0 && has(relationPath, 'relate')) {
        settings.added = 'relate';
      }
    } else {
      const isRoot = relationPath.length === 0;
      const relate = !isRoot && has(relationPath, 'relate');
      const insertMissing = has(relationPath, 'insertMissing');

      if (relate || insertMissing) {
        settings.added = relate ? (insertMissing ? 'relateOrInsert' : 'relate') : 'insert';
      }

      settings.kept = has(relationPath, 'noUpdate')
        ? 'preserve'
        : has(relationPath, 'update')
          ? 'update'
          : 'patch';

      if (!isRoot) {
        const unrelate = has(relationPath, 'unrelate');
        const noUnrelate = has(relationPath, 'noUnrelate');
        const noDelete = has(relationPath, 'noDelete');

        // `noUnrelate` alone deletes the rows left out but keeps the rows that
        // move elsewhere, and with `unrelate` it keeps them but still lets the
        // writer clear their slots early, which no `removed` value does.
        if (noUnrelate && (unrelate || !noDelete)) {
          return null;
        }

        settings.removed = unrelate ? 'unrelate' : noDelete ? 'preserve' : 'delete';
      }
    }

    return settings;
  };

  const root = getSettings([]);
  const relations = {};

  if (!root) {
    return null;
  }

  for (const relationPath of getRelationPaths(modelClass, graph)) {
    const settings = getSettings(relationPath);

    if (!settings) {
      return null;
    }

    relations[relationPath.join('.')] = settings;
  }

  const strictOptions = { strict: true, root, relations };

  for (const name of ['allowRefs', 'allowMarkers', 'fetchStrategy']) {
    if (options[name] !== undefined) {
      strictOptions[name] = options[name];
    }
  }

  return strictOptions;
}

// The relation paths that the data of `graph` gives, including relations set
// to `null` or `[]`, which remove the current models.
function getRelationPaths(modelClass, graph) {
  const relationPaths = new Map();
  const collect = (modelClass, graph, relationPath) => {
    for (const obj of Array.isArray(graph) ? graph : [graph]) {
      for (const relationName of isObject(obj) ? modelClass.getRelationNames() : []) {
        if (obj[relationName] !== undefined) {
          const path = [...relationPath, relationName];
          const { relatedModelClass } = modelClass.getRelation(relationName);
          relationPaths.set(path.join('.'), path);
          collect(relatedModelClass, obj[relationName], path);
        }
      }
    }
  };

  collect(modelClass, graph, []);
  return [...relationPaths.values()];
}

// Runs the `insertGraph()` and `upsertGraph()` calls of the tests registered
// in the current `describe()` with the options converted by
// `toStrictGraphOptions()`. Calls whose options strict mode can't express run
// with their own options.
export function useStrictGraphOptions() {
  const methods = {
    insertGraph: true,
    insertGraphAndFetch: true,
    upsertGraph: false,
    upsertGraphAndFetch: false,
  };
  const originals = {};

  beforeAll(() => {
    for (const [name, insertOnly] of Object.entries(methods)) {
      const original = (originals[name] = QueryBuilder.prototype[name]);

      QueryBuilder.prototype[name] = function (graph, options) {
        const strictOptions = toStrictGraphOptions(this.modelClass(), graph, options, insertOnly);
        return original.call(this, graph, strictOptions ?? options);
      };
    }
  });

  afterAll(() => {
    Object.assign(QueryBuilder.prototype, originals);
  });
}
