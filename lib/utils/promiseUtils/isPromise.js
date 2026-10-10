import { isObject, isFunction } from '../objectUtils.js';

export function isPromise(obj) {
  return isObject(obj) && isFunction(obj.then);
}
