'use strict';

const { WhereGroupOperation } = require('./operations/WhereGroupOperation');
const { isObject, isFunction } = require('../utils/objectUtils');
const { isKnexRaw } = require('../utils/knexUtils');

// Where operations of a query can come from different sources: the user, a
// relation's owner condition, the relation's `modify`/`filter` and so on. Each
// source forms its own "where group". All operations the user adds belong to
// the default group, and `addWhereGroup` assigns the operations added inside
// its callback to a new, separate group.
//
// Knex simply joins all where clauses with their `and` or `or` boolean. Since
// `and` binds tighter than `or`, a user's `orWhere` would escape the relation's
// owner condition: `where "ownerId" in (1) and a or b`. This would find, update
// and delete rows of other owners too. See issues #2191 and #1909.
//
// To prevent this, `wrapWhereGroups` is called after all `onBuild` hooks have
// run. If a query contains more than one where group, every group that may
// contain an `or` at its top level is wrapped in parentheses, so that the
// groups are always ANDed together: `where "ownerId" in (1) and (a or b)`.
// Groups without an `or` are left alone so that their SQL doesn't change.
function addWhereGroup(builder, callback) {
  const parentWhereGroup = builder._whereGroup;
  builder._whereGroup = {};

  try {
    return callback(builder);
  } finally {
    builder._whereGroup = parentWhereGroup;
  }
}

function wrapWhereGroups(builder) {
  const WhereSelector = builder.constructor.WhereSelector;
  const whereOps = new Set();
  const groups = new Map();

  builder.forEachOperation(WhereSelector, (op) => {
    // Only consider the top-most where operations. The descendants of a
    // where operation are built as part of it.
    if (op.isAncestorInSet(whereOps)) {
      return;
    }

    whereOps.add(op);

    const group = getWhereGroup(op);
    let ops = groups.get(group);

    if (!ops) {
      ops = [];
      groups.set(group, ops);
    }

    ops.push(op);
  });

  if (groups.size < 2) {
    return builder;
  }

  for (const [group, ops] of groups) {
    if (ops.some(mayContainTopLevelOr)) {
      wrapOperations(builder, group, ops);
    }
  }

  return builder;
}

function getWhereGroup(op) {
  for (let it = op; it; it = it.parentOperation) {
    if (it.whereGroup) {
      return it.whereGroup;
    }
  }

  return null;
}

function mayContainTopLevelOr(op) {
  if (op instanceof WhereGroupOperation) {
    return false;
  }

  // orWhere, orWhereIn, orWhereRaw, orWhereExists, orWhereJsonSupersetOf etc.
  if (/^or[A-Z]/.test(op.name)) {
    return true;
  }

  // Raw SQL isn't parenthesized by knex and can contain `or`.
  if (/Raw$/.test(op.name)) {
    return true;
  }

  return Array.isArray(op.args) && op.args.length === 1 && isRaw(op.args[0]);
}

function isRaw(arg) {
  return isKnexRaw(arg) || (isObject(arg) && isFunction(arg.toKnexRaw));
}

function wrapOperations(builder, group, ops) {
  const groupOp = new WhereGroupOperation('where');
  groupOp.whereGroup = group;

  builder.replaceOperation(ops[0], groupOp);

  for (let i = 1; i < ops.length; ++i) {
    builder.removeOperation(ops[i]);
  }

  for (const op of ops) {
    op.parentOperation = null;
    op.adderHookName = null;
  }

  groupOp.operations = ops;
}

module.exports = {
  addWhereGroup,
  wrapWhereGroups,
};
