import { isInternalProp } from '../utils/internalPropUtils.js';
import { splitQueryProps, omitQueryProps } from './modelQueryProps.js';
import { asArray, isFunction, isString, isPlainObject } from '../utils/objectUtils.js';
import { parseRelationsIntoModelInstances } from './modelParseRelations.js';

export function setJson(model, json, options) {
  json = json || {};
  options = options || {};

  if (Object.prototype.toString.call(json) !== '[object Object]') {
    throw new Error(
      'You should only pass objects to $setJson method. ' +
        '$setJson method was given an invalid value ' +
        json,
    );
  }

  // json can contain "query properties" like `raw` instances, query builders etc.
  // We take them out of `json` and store them to a hidden property $$queryProps
  // in the model instance for later use.
  json = splitQueryProps(model, json);
  json = model.$parseJson(json, options);
  json = model.$validate(json, options);
  json = omitQueryProps(model, json);

  model.$set(json);

  if (!options.skipParseRelations) {
    parseRelationsIntoModelInstances(model, json, options);
  }

  return model;
}

export function setDatabaseJson(model, json) {
  json = model.$parseDatabaseJson(json);

  if (json) {
    const keys = Object.keys(json);

    for (let i = 0, l = keys.length; i < l; ++i) {
      const key = keys[i];
      model[key] = json[key];
    }
  }

  return model;
}

export function setFast(model, obj) {
  if (obj) {
    // Don't try to set read-only properties. They can easily get here
    // through `fromJson` when parsing an object that was previously
    // serialized from a model instance.
    const readOnlyAttr = model.constructor.getReadOnlyAttributes();
    const keys = Object.keys(obj);

    for (let i = 0, l = keys.length; i < l; ++i) {
      const key = keys[i];
      const value = obj[key];

      if (
        (value !== undefined || isPlainObject(obj)) &&
        !isInternalProp(key) &&
        !isFunction(value) &&
        !readOnlyAttr.includes(key)
      ) {
        model[key] = value;
      }
    }
  }

  return model;
}

export function setRelated(model, relation, models) {
  relation = ensureRelation(model, relation);
  const previous = model[relation.name];
  assignRelated(model, relation, models);
  syncForeignKeys(model, relation, model[relation.name], previous);
  return model;
}

export function appendRelated(model, relation, models) {
  relation = ensureRelation(model, relation);

  if (!model[relation.name] || relation.isOneToOne()) {
    return model.$setRelated(relation, models);
  } else {
    assignRelated(model, relation, models, { append: true });
    syncForeignKeys(model, relation, models);
  }

  return model;
}

// Assigns related models without syncing foreign keys, for the relation queries
// that set the keys themselves:
export function assignRelated(model, relation, models, { append = false } = {}) {
  if (append && model[relation.name] && !relation.isOneToOne()) {
    if (Array.isArray(models)) {
      models.forEach((it) => model[relation.name].push(it));
    } else if (models) {
      model[relation.name].push(models);
    }
  } else if (relation.isOneToOne()) {
    if (Array.isArray(models)) {
      model[relation.name] = models[0] || null;
    } else {
      model[relation.name] = models || null;
    }
  } else {
    if (!models) {
      model[relation.name] = [];
    } else if (Array.isArray(models)) {
      model[relation.name] = models;
    } else {
      model[relation.name] = [models];
    }
  }
}

function ensureRelation(model, relation) {
  if (isString(relation)) {
    return model.constructor.getRelation(relation);
  } else {
    return relation;
  }
}

// Let the foreign keys follow the relation: a `BelongsToOneRelation` points the
// owner to the related model, `HasOneRelation` and `HasManyRelation` point the
// related models to the owner, and the models that leave them to nothing. The
// keys of `ManyToManyRelation` and `HasOneThroughRelation` live in the join
// table.
function syncForeignKeys(model, relation, related, previous) {
  const { ownerProp, relatedProp } = relation;

  if (relation.isObjectionBelongsToOneRelation) {
    copyKey(relatedProp, related, ownerProp, model);
  } else if (relation.isObjectionHasManyRelation) {
    const models = asModels(related);

    for (const it of models) {
      copyKey(ownerProp, model, relatedProp, it);
    }

    if (ownerProp.hasProps(model)) {
      const key = ownerProp.propKey(model);

      for (const it of asModels(previous)) {
        // Only clear the keys that still point to the owner, not the keys of
        // models that moved to another owner in the meantime:
        if (!models.includes(it) && relatedProp.propKey(it) === key) {
          copyKey(ownerProp, null, relatedProp, it);
        }
      }
    }
  }
}

// Copies the key of `source` to `target`, or clears it if there's none to copy:
function copyKey(sourceProp, source, targetProp, target) {
  const hasKey = !!source && sourceProp.hasProps(source);

  targetProp.forEach((i) => {
    targetProp.setProp(target, i, hasKey ? sourceProp.getProp(source, i) : null);
  });
}

function asModels(value) {
  return asArray(value).filter(Boolean);
}
