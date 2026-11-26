import { isString } from './objectUtils.js';

// Memoizes functions of a single argument. The functions can receive strings
// from untrusted input, e.g. expressions from query strings, so the cache is
// bounded: long strings aren't cached, and once the cache is full, new results
// aren't either. Unlike dropping old entries, this keeps the cache from
// thrashing when an app uses more identifiers than fit into it.
const MAX_CACHE_SIZE = 10000;
const MAX_CACHED_STRING_LENGTH = 512;

export function memoize(func) {
  const cache = new Map();

  return (input) => {
    let output = cache.get(input);

    if (output === undefined) {
      output = func(input);

      if (
        cache.size < MAX_CACHE_SIZE &&
        (!isString(input) || input.length <= MAX_CACHED_STRING_LENGTH)
      ) {
        cache.set(input, output);
      }
    }

    return output;
  };
}
