import { isPromise } from './isPromise.js';

// Handle the rejections of the promises in `values`, for when a later call
// throws and the caller rethrows that error instead: nothing would wait for
// them, and Node ends the process on unhandled rejections (#566).
export function handleRejections(values) {
  for (const value of values) {
    if (isPromise(value)) {
      value.then(null, () => {});
    }
  }
}
