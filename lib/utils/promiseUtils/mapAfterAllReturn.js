import { isPromise } from './isPromise.js';
import { handleRejections } from './handleRejections.js';

// Map `arr` with `mapper` and after that return `returnValue`. If none of
// the mapped values is a promise, return synchronously for performance
// reasons.
export function mapAfterAllReturn(arr, mapper, returnValue) {
  const results = new Array(arr.length);
  let containsPromise = false;

  try {
    for (let i = 0, l = arr.length; i < l; ++i) {
      results[i] = mapper(arr[i]);

      if (isPromise(results[i])) {
        containsPromise = true;
      }
    }
  } catch (err) {
    handleRejections(results);
    throw err;
  }

  if (containsPromise) {
    return Promise.all(results).then(() => returnValue);
  } else {
    return returnValue;
  }
}
