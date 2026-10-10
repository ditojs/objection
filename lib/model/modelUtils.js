export const hiddenProps = ['$$queryProps'];

export const staticHiddenProps = [
  '$$knex',
  '$$validator',
  '$$jsonSchema',
  '$$colToProp',
  '$$propToCol',
  '$$relationMappings',
  '$$relations',
  '$$relationNames',
  '$$jsonAttributes',
  '$$columnNameMappers',
  '$$tableMetadata',
  '$$readOnlyAttributes',
  '$$idRelationProperty',
  '$$virtualAttributes',
];

export function defineNonEnumerableProperty(obj, prop, value) {
  Object.defineProperty(obj, prop, {
    enumerable: false,
    writable: true,
    configurable: true,
    value,
  });
}

export function keyByProps(models, props) {
  const map = new Map();

  for (let i = 0, l = models.length; i < l; ++i) {
    const model = models[i];
    map.set(model.$propKey(props), model);
  }

  return map;
}
