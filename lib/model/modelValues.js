'use strict';

const { isObject } = require('../utils/objectUtils');

// Property keys needs to be prefixed with a non-numeric character so that
// they are not considered indexes when used as object keys.
const PROP_KEY_PREFIX = 'k_';

function values(model, args) {
  switch (args.length) {
    case 1:
      return values1(model, args);
    case 2:
      return values2(model, args);
    case 3:
      return values3(model, args);
    default:
      return valuesN(model, args);
  }
}

function propKey(model, props) {
  return valuesKey(values(model, props));
}

// Turn values into a key to look up models by. Escape the separators in
// composite keys, since strings can contain them.
function valuesKey(values) {
  if (values.length === 1) {
    return PROP_KEY_PREFIX + propToStr(values[0]);
  } else {
    let key = PROP_KEY_PREFIX;

    for (let i = 0, l = values.length; i < l; ++i) {
      const str = propToStr(values[i]);

      if (i > 0) {
        key += ',';
      }

      key += str.includes(',') || str.includes('\\') ? str.replace(/[,\\]/g, '\\$&') : str;
    }

    return key;
  }
}

function hasProps(model, props) {
  for (let i = 0; i < props.length; ++i) {
    const value = model[props[i]];

    if (isNullOrUndefined(value)) {
      return false;
    }
  }

  return true;
}

function values1(model, args) {
  return [model[args[0]]];
}

function values2(model, args) {
  return [model[args[0]], model[args[1]]];
}

function values3(model, args) {
  return [model[args[0]], model[args[1]], model[args[2]]];
}

function valuesN(model, args) {
  const ret = new Array(args.length);

  for (let i = 0, l = args.length; i < l; ++i) {
    ret[i] = model[args[i]];
  }

  return ret;
}

function propToStr(value) {
  if (isObject(value)) {
    return Buffer.isBuffer(value) ? value.toString('hex') : JSON.stringify(value);
  } else {
    return `${value}`;
  }
}

function isNullOrUndefined(val) {
  return val === null || val === undefined;
}

module.exports = {
  values,
  hasProps,
  propKey,
  valuesKey,
};
