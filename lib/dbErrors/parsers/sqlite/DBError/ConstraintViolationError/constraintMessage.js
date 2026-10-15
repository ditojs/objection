// Return the text of the SQLite error `err` from `<kind> constraint failed` on,
// e.g. 'UNIQUE constraint failed: t.a', if it's a constraint error of that kind,
// or else `null`. `better-sqlite3` names the kind in its extended code, e.g.
// `SQLITE_CONSTRAINT_UNIQUE`, `sqlite3` only after `SQLITE_CONSTRAINT: `. knex
// puts the SQL with its values in front, so the last match is SQLite's own.
export function getConstraintMessage(err, kind) {
  const text = `${kind} constraint failed`;
  const isKind =
    err.code === `SQLITE_CONSTRAINT_${kind.replace(' ', '')}` ||
    (err.code === 'SQLITE_CONSTRAINT' &&
      /.*SQLITE_CONSTRAINT: (.*)$/s.exec(err.message)?.[1].startsWith(text));

  return isKind ? err.message.slice(err.message.lastIndexOf(text)) : null;
}
