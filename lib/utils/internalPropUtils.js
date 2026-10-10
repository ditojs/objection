const INTERNAL_PROP_PREFIX = '$';

export function isInternalProp(propName) {
  return propName[0] === INTERNAL_PROP_PREFIX;
}
