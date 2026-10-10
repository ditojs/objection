const cache = new Map();

export function inheritModel(modelClass) {
  let inherit = cache.get(modelClass.name);

  if (!inherit) {
    inherit = createClassInheritor(modelClass.name);
    cache.set(modelClass.name, inherit);
  }

  return inherit(modelClass);
}

function createClassInheritor(className) {
  return new Function(
    'BaseClass',
    `
    'use strict';
    return class ${className} extends BaseClass {}
  `,
  );
}
