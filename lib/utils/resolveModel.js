import path from 'node:path';
import { createRequire } from 'node:module';
import { isString, isFunction } from '../utils/objectUtils.js';

// Model files given as paths are loaded synchronously with `require()`, which
// on Node >= 20.19 loads both CommonJS and ES modules (without top-level await).
const require = createRequire(import.meta.url);

class ResolveError extends Error {}

export function resolveModel(modelRef, modelPaths, errorPrefix) {
  try {
    if (isString(modelRef)) {
      if (isAbsolutePath(modelRef)) {
        return requireModel(modelRef);
      } else if (modelPaths) {
        return requireUsingModelPaths(modelRef, modelPaths);
      }
    } else {
      if (isFunction(modelRef) && !isModelClass(modelRef)) {
        modelRef = modelRef();
      }

      if (!isModelClass(modelRef)) {
        throw new ResolveError(
          `is not a subclass of Model or a file path to a module that exports one. You may be dealing with circular imports (a require loop). See the documentation section about circular imports.`,
        );
      }

      return modelRef;
    }
  } catch (err) {
    if (err instanceof ResolveError) {
      throw new Error(`${errorPrefix}: ${err.message}`);
    } else {
      throw err;
    }
  }
}

function requireUsingModelPaths(modelRef, modelPaths) {
  let firstError = null;

  for (const modelPath of modelPaths) {
    try {
      return requireModel(path.join(modelPath, modelRef));
    } catch (err) {
      if (firstError === null) {
        firstError = err;
      }
    }
  }

  if (firstError) {
    throw firstError;
  } else {
    throw new ResolveError(`could not resolve ${modelRef} using modelPaths`);
  }
}

function requireModel(modelPath) {
  let mod = require(path.resolve(modelPath));
  let modelClass = null;

  if (isModelClass(mod)) {
    modelClass = mod;
  } else if (isModelClass(mod.default)) {
    // ES module or Babel style default export.
    modelClass = mod.default;
  } else {
    Object.keys(mod).forEach((exportName) => {
      const exp = mod[exportName];

      if (isModelClass(exp)) {
        if (modelClass !== null) {
          throw new ResolveError(
            `path ${modelPath} exports multiple models. Don't know which one to choose.`,
          );
        }

        modelClass = exp;
      }
    });
  }

  if (!isModelClass(modelClass)) {
    throw new ResolveError(`${modelPath} is an invalid file path to a model class`);
  }

  return modelClass;
}

function isAbsolutePath(pth) {
  return path.normalize(pth + '/') === path.normalize(path.resolve(pth) + '/');
}

function isModelClass(maybeModel) {
  return isFunction(maybeModel) && maybeModel.isObjectionModelClass;
}
