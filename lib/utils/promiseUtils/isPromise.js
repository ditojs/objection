import { isObject, isFunction } from '../objectUtils.js';

function isPromise(obj) {
  return isObject(obj) && isFunction(obj.then);
}

export { isPromise };
