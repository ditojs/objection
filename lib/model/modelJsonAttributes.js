'use strict';

const { asArray, isObject, flatten, isString } = require('../utils/objectUtils');

function parseJsonAttributes(json, modelClass) {
  const jsonAttr = modelClass.getJsonAttributes();

  if (jsonAttr.length) {
    // JSON attributes may be returned as strings depending on the database and
    // the database client. Convert them to objects here.
    for (let i = 0, l = jsonAttr.length; i < l; ++i) {
      const attr = jsonAttr[i];
      const value = json[attr];

      if (isString(value)) {
        const parsed = tryParseJson(value);

        // tryParseJson returns undefined if parsing failed. Clients like `pg`
        // already parse JSON columns, so the string may be the value itself.
        if (parsed !== undefined && !shouldKeepString(parsed, attr, modelClass)) {
          json[attr] = parsed;
        }
      }
    }
  }

  return json;
}

function formatJsonAttributes(json, modelClass) {
  const jsonAttr = modelClass.getJsonAttributes();

  if (jsonAttr.length) {
    // All database clients want JSON columns as strings. Do the conversion here.
    for (let i = 0, l = jsonAttr.length; i < l; ++i) {
      const attr = jsonAttr[i];
      const value = json[attr];

      if (value != null) {
        json[attr] = JSON.stringify(value);
      }
    }
  }

  return json;
}

function getJsonAttributes(modelClass) {
  let jsonAttributes = modelClass.jsonAttributes;

  if (Array.isArray(jsonAttributes)) {
    return jsonAttributes;
  }

  jsonAttributes = [];

  if (modelClass.getJsonSchema()) {
    const props = modelClass.getJsonSchema().properties || {};

    for (const propName of Object.keys(props)) {
      const types = getSchemaTypes(props[propName]);

      if (types.indexOf('object') !== -1 || types.indexOf('array') !== -1) {
        jsonAttributes.push(propName);
      }
    }
  }

  return jsonAttributes;
}

function getSchemaTypes(prop) {
  let types = asArray(prop.type).filter((it) => !!it);

  if (types.length === 0 && Array.isArray(prop.anyOf)) {
    types = flatten(prop.anyOf.map((it) => it.type));
  }

  if (types.length === 0 && Array.isArray(prop.oneOf)) {
    types = flatten(prop.oneOf.map((it) => it.type));
  }

  return types;
}

// Keep the string if the schema allows strings but not the parsed value.
function shouldKeepString(parsed, attr, modelClass) {
  const prop = modelClass.getJsonSchema()?.properties?.[attr];
  const types = prop ? getSchemaTypes(prop) : [];
  const type = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
  return (
    types.includes('string') &&
    !types.includes(type) &&
    !(types.includes('integer') && Number.isInteger(parsed))
  );
}

function tryParseJson(maybeJsonStr) {
  try {
    return JSON.parse(maybeJsonStr);
  } catch (err) {
    return undefined;
  }
}

module.exports = {
  parseJsonAttributes,
  formatJsonAttributes,
  getJsonAttributes,
};
