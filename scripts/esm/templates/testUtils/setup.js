import { expect } from 'vitest';
import { QueryBuilderUserContext } from '../lib/queryBuilder/QueryBuilderUserContext.js';

// The user context of a query keeps a reference to its query builder under a symbol
// key, which vitest would compare too. Only compare the context values themselves.
expect.addEqualityTesters([
  function userContextEquality(a, b, customTesters) {
    if (a instanceof QueryBuilderUserContext || b instanceof QueryBuilderUserContext) {
      return this.equals(contextValues(a), contextValues(b), customTesters);
    }
  },
]);

function contextValues(value) {
  return value instanceof QueryBuilderUserContext
    ? Object.fromEntries(Object.entries(value))
    : value;
}

expect.extend({
  // Like `toMatchObject()`, but arrays in `expected` only need to be a subset of
  // the arrays in `received`: each expected item has to match one of the received
  // items, regardless of their order and the lengths of the arrays.
  toContainSubset(received, expected) {
    const pass = isSubset(expected, received);
    const { printReceived, printExpected } = this.utils;

    return {
      pass,
      message: () =>
        `expected ${printReceived(received)} ${pass ? 'not ' : ''}to contain subset ${printExpected(expected)}`,
      actual: received,
      expected,
    };
  },
});

function isSubset(expected, actual) {
  if (expected === actual) {
    return true;
  }

  if (typeof expected !== 'object' || expected === null) {
    return false;
  }

  if (typeof actual !== 'object' || actual === null) {
    return false;
  }

  if (Array.isArray(expected)) {
    return (
      typeof actual.length === 'number' &&
      expected.every((item) => Array.from(actual).some((it) => isSubset(item, it)))
    );
  }

  if (expected instanceof Date) {
    return actual instanceof Date && expected.getTime() === actual.getTime();
  }

  return Object.keys(expected).every((key) => isSubset(expected[key], actual[key]));
}
