import { isPromise } from './isPromise.js';

// Call `func` after `obj` has been resolved. Call `func` synchronously if
// `obj` is not a promise for performance reasons.
export function after(obj, func) {
  if (isPromise(obj)) {
    return obj.then(func);
  } else {
    return func(obj);
  }
}
