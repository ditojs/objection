import { expect } from 'vitest';

export { cloneDeep } from '../lib/utils/objectUtils.js';

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
export function expectPartialEqual(result, partial) {
  if (Array.isArray(result) && Array.isArray(partial)) {
    expect(result).toHaveLength(partial.length);
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
    expect(pick(result, partialKeys)).toEqual(partial);
  } else {
    throw new Error('result and partial must both be arrays or objects');
  }
}

/**
 * Expect that `fn` throws, and pass the thrown error to `check` to make further
 * assertions about it.
 */
export function expectThrows(fn, check) {
  let error;

  try {
    fn();
  } catch (err) {
    error = err;
  }

  expect(error, 'expected function to throw').toBeDefined();
  check(error);
}

export function createRejectionReflection(err) {
  return {
    isRejected: () => true,
    isFulfilled: () => false,
    reason: () => err,
  };
}

// Insert rows with their ids into a table with an identity column. SQL Server
// only takes them with IDENTITY_INSERT, and Postgres needs its sequence moved
// past them, so that the next inserts get new ids.
export async function insertRowsWithIds(knex, table, rows) {
  const { dialect } = knex.client;

  if (rows.length > 0) {
    if (dialect === 'mssql') {
      // The setting only lasts for one batch:
      const { sql, bindings } = knex(table).insert(rows).toSQL();
      await knex.raw(`SET IDENTITY_INSERT ?? ON; ${sql}; SET IDENTITY_INSERT ?? OFF`, [
        table,
        ...bindings,
        table,
      ]);
    } else {
      await knex(table).insert(rows);
    }
  }

  if (dialect === 'postgresql') {
    await knex.raw(
      "select setval(pg_get_serial_sequence(?, 'id'), coalesce(max(id), 0) + 1, false) from ??",
      [table, table],
    );
  }
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value) {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
}

// Like lodash's `pick`: copies the given keys (own or inherited) that exist in `obj`.
export function pick(obj, ...keys) {
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
export function range(start, end, step) {
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
export function sortBy(items, ...iteratees) {
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
