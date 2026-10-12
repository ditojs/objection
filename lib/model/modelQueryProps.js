'use strict';

const { isObject, isFunction, omit } = require('../utils/objectUtils');
const { defineNonEnumerableProperty } = require('./modelUtils');
const { isKnexRaw, isKnexQueryBuilder } = require('../utils/knexUtils');
const { getFieldExpressionColumn } = require('../utils/parseFieldExpression');

const QUERY_PROPS_PROPERTY = '$$queryProps';

// Moves the query properties of `json` into a hidden property of `model` so
// that they can be later merged back to its database json. A key holds either
// a value or a query property, so the keys given in `json` replace the ones
// that the model holds as the other kind.
function splitQueryProps(model, json) {
  const keys = Object.keys(json);
  const oldQueryProps = model[QUERY_PROPS_PROPERTY];

  if (!json.$isObjectionModel && hasQueryProps(json, keys)) {
    const queryProps = Object.assign({}, oldQueryProps);
    const modelProps = {};

    for (let i = 0, l = keys.length; i < l; ++i) {
      const key = keys[i];
      const value = json[key];

      if (isQueryProp(value)) {
        queryProps[key] = value;
        delete model[key];
      } else {
        modelProps[key] = value;
        delete queryProps[key];
      }
    }

    defineNonEnumerableProperty(model, QUERY_PROPS_PROPERTY, queryProps);

    return modelProps;
  } else {
    if (oldQueryProps) {
      defineNonEnumerableProperty(model, QUERY_PROPS_PROPERTY, omit(oldQueryProps, keys));
    }

    return json;
  }
}

// Omits the values that parsing and validation add to `json` for the keys that
// `model` holds query properties for, like Ajv defaults.
function omitQueryProps(model, json) {
  const keys = getQueryPropKeys(model);
  return keys.length > 0 ? omit(json, keys) : json;
}

// Removes the query properties of the keys that were given a value since, by an
// assignment, `$set()` or a write that fetched the value from the database. We
// do this when the model is passed to a write, and not when its database json
// is built, so that the values set by its hooks don't override them.
function removeOverriddenQueryProps(model) {
  const queryProps = model[QUERY_PROPS_PROPERTY];

  if (queryProps) {
    const jsonSchema = model.constructor.getJsonSchema();
    const properties = jsonSchema && jsonSchema.properties;
    // The json column of a field expression key like `data:a` overrides it too:
    const keys = Object.keys(queryProps).filter((key) => {
      const column = getFieldExpressionColumn(key, properties);
      return model[key] !== undefined || (column !== null && model[column] !== undefined);
    });

    if (keys.length > 0) {
      defineNonEnumerableProperty(model, QUERY_PROPS_PROPERTY, omit(queryProps, keys));
    }
  }
}

function hasQueryProps(json, keys) {
  for (let i = 0, l = keys.length; i < l; ++i) {
    if (isQueryProp(json[keys[i]])) {
      return true;
    }
  }

  return false;
}

function isQueryProp(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    isKnexQueryBuilder(value) ||
    isKnexRaw(value) ||
    isKnexRawConvertable(value) ||
    value.isObjectionQueryBuilderBase
  );
}

// Merges and converts `model`'s query properties into `json`.
function mergeQueryProps(model, json, omitProps, builder) {
  json = convertExistingQueryProps(json, builder);
  json = convertAndMergeHiddenQueryProps(model, json, omitProps, builder);

  return json;
}

// Converts the query properties in `json` to knex raw instances.
// `json` may have query properties even though we removed them.
// For example they may have been added in lifecycle hooks.
function convertExistingQueryProps(json, builder) {
  const keys = Object.keys(json);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = json[key];

    if (isQueryProp(value)) {
      json[key] = queryPropToKnexRaw(value, builder);
    }
  }

  return json;
}

// Converts and merges the query props that were split from the model
// and stored into QUERY_PROPS_PROPERTY.
function convertAndMergeHiddenQueryProps(model, json, omitProps, builder) {
  const queryProps = model[QUERY_PROPS_PROPERTY];

  if (!queryProps) {
    // The model has no query properties.
    return json;
  }

  const modelClass = model.constructor;
  const keys = Object.keys(queryProps);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];

    if (!omitProps || !omitProps.includes(key)) {
      const queryProp = queryPropToKnexRaw(queryProps[key], builder);
      json[modelClass.propertyNameToColumnName(key)] = queryProp;
    }
  }

  return json;
}

// Returns the keys of the query properties that were split from `model`.
function getQueryPropKeys(model) {
  const queryProps = model[QUERY_PROPS_PROPERTY];
  return queryProps ? Object.keys(queryProps) : [];
}

// Converts a query property into a knex `raw` instance.
function queryPropToKnexRaw(queryProp, builder) {
  if (!queryProp) {
    return queryProp;
  }

  if (queryProp.isObjectionQueryBuilderBase) {
    return buildObjectionQueryBuilder(queryProp, builder);
  } else if (isKnexRawConvertable(queryProp)) {
    return buildKnexRawConvertable(queryProp, builder);
  } else {
    return queryProp;
  }
}

function buildObjectionQueryBuilder(builder, parentBuilder) {
  return builder.subqueryOf(parentBuilder).toKnexQuery();
}

function buildKnexRawConvertable(convertable, builder) {
  if (!builder) {
    throw new Error(
      'toDatabaseJson called without a query builder instance for a model with query properties',
    );
  }

  return convertable.toKnexRaw(builder);
}

function isKnexRawConvertable(queryProp) {
  return isFunction(queryProp.toKnexRaw);
}

module.exports = {
  splitQueryProps,
  omitQueryProps,
  removeOverriddenQueryProps,
  mergeQueryProps,
  getQueryPropKeys,
  isQueryProp,
};
