import { isObject } from '../utils/objectUtils.js';

// Property keys needs to be prefixed with a non-numeric character so that
// they are not considered indexes when used as object keys.
const PROP_KEY_PREFIX = 'k_';

export function values(model, args) {
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

// Turn the props of a model into a key to look up models by.
export function propKey(model, props) {
  if (props.length === 1) {
    return PROP_KEY_PREFIX + propToStr(model[props[0]]);
  } else {
    let key = PROP_KEY_PREFIX + compositePropToStr(model[props[0]]);

    for (let i = 1, l = props.length; i < l; ++i) {
      key += ',' + compositePropToStr(model[props[i]]);
    }

    return key;
  }
}

// Same as `propKey()`, for values that were already collected.
export function valuesKey(values) {
  if (values.length === 1) {
    return PROP_KEY_PREFIX + propToStr(values[0]);
  } else {
    let key = PROP_KEY_PREFIX + compositePropToStr(values[0]);

    for (let i = 1, l = values.length; i < l; ++i) {
      key += ',' + compositePropToStr(values[i]);
    }

    return key;
  }
}

export function hasProps(model, props) {
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
  if (!isObject(value)) {
    return `${value}`;
  } else if (value instanceof Date) {
    // Key dates by their time, as some drivers return them as numbers.
    return `${value.getTime()}`;
  } else if (Buffer.isBuffer(value)) {
    return value.toString('hex');
  } else {
    return JSON.stringify(value);
  }
}

// Escape the separators in composite keys, since strings can contain them.
// Numbers can't, so we don't need to check them.
function compositePropToStr(value) {
  if (typeof value === 'number') {
    return `${value}`;
  } else {
    const str = propToStr(value);
    return str.includes(',') || str.includes('\\') ? str.replace(/[,\\]/g, '\\$&') : str;
  }
}

function isNullOrUndefined(val) {
  return val === null || val === undefined;
}
