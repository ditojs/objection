import { isPromise } from './isPromise.js';

// Works like Bluebird.try.
export function promiseTry(callback) {
  try {
    const maybePromise = callback();

    if (isPromise(maybePromise)) {
      return maybePromise;
    } else {
      return Promise.resolve(maybePromise);
    }
  } catch (err) {
    return Promise.reject(err);
  }
}
