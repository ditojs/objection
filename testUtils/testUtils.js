const expect = require('expect.js');
const { cloneDeep } = require('../lib/utils/clone');

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

// Like lodash's `sortBy`: a stable ascending sort by one or more iteratees,
// each either a property name or a function. Without iteratees, the items
// themselves are compared. `null`, `undefined` and `NaN` values sort last.
function sortBy(items, ...iteratees) {
  iteratees = iteratees.flat();

  if (iteratees.length === 0) {
    iteratees = [(it) => it];
  }

  const getters = iteratees.map((iteratee) =>
    typeof iteratee === 'function' ? iteratee : (it) => (it == null ? undefined : it[iteratee]),
  );

  return (items == null ? [] : Array.from(items))
    .map((item) => ({ item, criteria: getters.map((get) => get(item)) }))
    .sort((a, b) => {
      for (let i = 0; i < a.criteria.length; ++i) {
        const result = compareAscending(a.criteria[i], b.criteria[i]);

        if (result !== 0) {
          return result;
        }
      }

      return 0;
    })
    .map(({ item }) => item);
}

function compareAscending(value, other) {
  if (value !== other) {
    const valIsDefined = value !== undefined;
    const valIsNull = value === null;
    const valIsReflexive = value === value;

    const othIsDefined = other !== undefined;
    const othIsNull = other === null;
    const othIsReflexive = other === other;

    if (
      (!othIsNull && value > other) ||
      (valIsNull && othIsDefined && othIsReflexive) ||
      (!valIsDefined && othIsReflexive) ||
      !valIsReflexive
    ) {
      return 1;
    }

    if (
      (!valIsNull && value < other) ||
      (othIsNull && valIsDefined && valIsReflexive) ||
      (!othIsDefined && valIsReflexive) ||
      !othIsReflexive
    ) {
      return -1;
    }
  }

  return 0;
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
