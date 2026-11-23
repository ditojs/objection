import { isPromise } from './isPromise.js';
import { after } from './after.js';
import { afterReturn } from './afterReturn.js';
import { mapAfterAllReturn } from './mapAfterAllReturn.js';
import { handleRejections } from './handleRejections.js';
import { promiseMap } from './map.js';
import { promiseTry } from './try.js';

export {
  isPromise,
  after,
  afterReturn,
  mapAfterAllReturn,
  handleRejections,
  promiseMap as map,
  promiseTry as try,
};
