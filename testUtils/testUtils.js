const expect = require('expect.js');
const { cloneDeep } = require('../lib/utils/objectUtils');

/**
 * Expect that `result` contains all attributes of `partial` and their values equal.
 *
 * Example:
 *
 * ```js
 * // doesn't throw.
 * expectPartialEqual({a: 1, b: 2}, {a: 1});
 * // doesn't throw.
 * expectPartialEqual([{a: 1, b: 2}, {a: 2, b: 4}], [{a: 1}, {b: 4}]);
 * // Throws
 * expectPartialEqual({a: 1}, {b: 1});
 * // Throws
 * expectPartialEqual({a: 1}, {a: 2});
 * ```
 */
function expectPartialEqual(result, partial) {
  if (Array.isArray(result) && Array.isArray(partial)) {
    expect(result).to.have.length(partial.length);
    result.forEach((value, idx) => {
      expectPartialEqual(result[idx], partial[idx]);
    });
  } else if (
    isObject(result) &&
    !Array.isArray(partial) &&
    isObject(partial) &&
    !Array.isArray(result)
  ) {
    var partialKeys = Object.keys(partial);
    expect(pick(result, partialKeys)).to.eql(partial);
  } else {
    throw new Error('result and partial must both be arrays or objects');
  }
}

function createRejectionReflection(err) {
  return {
    isRejected: () => true,
    isFulfilled: () => false,
    reason: () => err,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value) {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
}

// Like lodash's `pick`: copies the given keys (own or inherited) that exist in `obj`.
function pick(obj, ...keys) {
  const result = {};

  if (obj != null) {
    for (const key of keys.flat()) {
      if (key in Object(obj)) {
        result[key] = obj[key];
      }
    }
  }

  return result;
}

// Like lodash's `range`: `range(end)` or `range(start, end[, step])`.
function range(start, end, step) {
  if (end === undefined) {
    end = start;
    start = 0;
  }

  if (step === undefined) {
    step = start < end ? 1 : -1;
  }

  const length = Math.max(Math.ceil((end - start) / (step || 1)), 0);
  return Array.from({ length }, (_, i) => start + i * step);
}

// Like lodash's `sortBy`: a stable ascending sort by property names or
// functions, or by the items themselves. `null` and `undefined` sort last.
function sortBy(items, ...iteratees) {
  const getters = iteratees
    .flat()
    .map((it) => (typeof it === 'function' ? it : (item) => item[it]));

  if (getters.length === 0) {
    getters.push((item) => item);
  }

  return [...items].sort((a, b) => {
    for (const get of getters) {
      const x = get(a);
      const y = get(b);

      if (x !== y) {
        if (x == null) return 1;
        if (y == null) return -1;
        return x < y ? -1 : 1;
      }
    }

    return 0;
  });
}

module.exports = {
  expectPartialEqual,
  createRejectionReflection,
  delay,
  cloneDeep,
  pick,
  range,
  sortBy,
};
