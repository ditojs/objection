const OWNER_JOIN_COLUMN_ALIAS_PREFIX = 'objectiontmpjoin';

export function getTempColumn(index) {
  return `${OWNER_JOIN_COLUMN_ALIAS_PREFIX}${index}`;
}

export function isTempColumn(col) {
  return col.startsWith(OWNER_JOIN_COLUMN_ALIAS_PREFIX);
}
