import { RelationExpression } from '../RelationExpression.js';
import { isString } from '../../utils/objectUtils.js';

const NO_RELATE = 'noRelate';
const NO_UNRELATE = 'noUnrelate';
const NO_INSERT = 'noInsert';
const NO_UPDATE = 'noUpdate';
const NO_DELETE = 'noDelete';

const UPDATE = 'update';
const RELATE = 'relate';
const UNRELATE = 'unrelate';
const INSERT_MISSING = 'insertMissing';
const FETCH_STRATEGY = 'fetchStrategy';
const ALLOW_REFS = 'allowRefs';
const ALLOW_MARKERS = 'allowMarkers';

// The options that are matched against the relation path of each node, see
// `has()`.
const NODE_OPTION_NAMES = [
  NO_RELATE,
  NO_UNRELATE,
  NO_INSERT,
  NO_UPDATE,
  NO_DELETE,
  UPDATE,
  RELATE,
  UNRELATE,
  INSERT_MISSING,
];

const OPTION_NAMES = [...NODE_OPTION_NAMES, FETCH_STRATEGY, ALLOW_REFS, ALLOW_MARKERS];

// `insertGraph` never fetches, updates or removes existing rows, so only the
// options about inserting and relating apply to it, and the others are set:
const INSERT_OPTION_NAMES = [RELATE, NO_RELATE, NO_INSERT, ALLOW_REFS];
const INSERT_ONLY_OPTIONS = {
  [NO_UPDATE]: true,
  [NO_DELETE]: true,
  [NO_UNRELATE]: true,
  [INSERT_MISSING]: true,
};

export const FetchStrategy = {
  OnlyIdentifiers: 'OnlyIdentifiers',
  Everything: 'Everything',
  OnlyNeeded: 'OnlyNeeded',
};

export class GraphOptions {
  // `insertOnly` is only set by `insertGraph`, which never fetches, updates or
  // removes existing rows.
  constructor(options, insertOnly = false) {
    checkForUnknownOptions(options, insertOnly);
    this.options = parseRelationExpressions(
      insertOnly ? { ...options, ...INSERT_ONLY_OPTIONS } : options,
    );
    this.insertOnly = insertOnly;
  }

  isFetchStrategy(strategy) {
    if (!FetchStrategy[strategy]) {
      throw new Error(`unknown strategy "${strategy}"`);
    }

    if (!this.options[FETCH_STRATEGY]) {
      return strategy === FetchStrategy.OnlyNeeded;
    } else {
      return this.options[FETCH_STRATEGY] === strategy;
    }
  }

  isInsertOnly() {
    return this.insertOnly;
  }

  // Whether a node that the graph relates or patches is written with `patch()`
  // or `update()`. With `noUpdate`, it's neither, and only the foreign keys of
  // its relates and BelongsToOneRelations are patched.
  shouldPatch(node) {
    return !this.has(node, NO_UPDATE) && !this.has(node, UPDATE);
  }

  shouldUpdate(node) {
    return !this.has(node, NO_UPDATE) && this.has(node, UPDATE);
  }

  allowRefs() {
    return !!this.options[ALLOW_REFS];
  }

  allowMarkers() {
    return !!this.options[ALLOW_MARKERS];
  }

  // Whether the option applies to the relation path of `node`.
  has(node, optionName) {
    const option = this.options[optionName];

    return isRelationExpression(option)
      ? matchesRelationExpression(option, node.relationPath)
      : Array.isArray(option)
        ? option.includes(node.relationPathKey)
        : !!option;
  }
}

// Reject misspelled options and options of `upsertGraph` passed to
// `insertGraph`, which would otherwise be ignored silently (#84). Options set
// to `undefined` count as not set.
function checkForUnknownOptions(options, insertOnly) {
  const [method, optionNames] = insertOnly
    ? ['insertGraph', INSERT_OPTION_NAMES]
    : ['upsertGraph', OPTION_NAMES];

  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined && !optionNames.includes(name)) {
      throw new Error(
        `"${name}" is not an option of ${method}(). Valid options are: ${optionNames.join(', ')}.`,
      );
    }
  }
}

// Parses the string values of the node options into relation expressions,
// once per operation, and checks the types of the other values.
function parseRelationExpressions(options) {
  let parsedOptions = options;

  for (const optionName of NODE_OPTION_NAMES) {
    const option = options[optionName];

    if (isString(option)) {
      if (parsedOptions === options) {
        parsedOptions = { ...options };
      }

      parsedOptions[optionName] = parseRelationExpression(optionName, option);
    } else if (!(option === undefined || typeof option === 'boolean' || Array.isArray(option))) {
      throw new Error(
        `expected ${optionName} option value "${option}" to be a boolean, an array of relation paths or a relation expression`,
      );
    }
  }

  return parsedOptions;
}

function parseRelationExpression(optionName, expression) {
  const createError = (message) => {
    return new Error(
      `invalid relation expression "${expression}" in ${optionName} option: ${message}`,
    );
  };

  let parsedExpression;

  try {
    parsedExpression = RelationExpression.create(expression);
  } catch (err) {
    throw createError(err.message);
  }

  if (parsedExpression.isEmpty && !parsedExpression.node.$allRecursive) {
    throw createError('the expression is empty');
  }

  // Relation paths are matched by relation name, so aliases would never match.
  const alias = findNode(parsedExpression.node, (node) => node.$name !== node.$relation);

  if (alias) {
    throw createError(`aliases like "${alias.$relation} as ${alias.$name}" are not supported`);
  }

  return parsedExpression;
}

function findNode(node, predicate) {
  for (const childName of node.$childNames) {
    const child = node[childName];
    const found = predicate(child) ? child : findNode(child, predicate);

    if (found) {
      return found;
    }
  }

  return null;
}

// A relation path matches a relation expression when it leads to a leaf of
// the expression, like it would match the same relation paths in an array:
// `'movies.reviews'` matches `movies.reviews` but not `movies`. `'*'` matches
// all relations below it and recursive expressions like `'parent.^'` match
// every level of the recursion. The root has no relation path and never
// matches.
function matchesRelationExpression(expression, relationPath) {
  if (relationPath.length === 0) {
    return false;
  }

  for (const relationName of relationPath) {
    expression = expression.childExpression(relationName);

    if (!expression) {
      return false;
    }
  }

  // Below `*`, the expression stays on the same node with increasing depth.
  if (expression.node.$allRecursive) {
    return expression.recursionDepth > 0;
  } else {
    return expression.isEmpty;
  }
}

function isRelationExpression(value) {
  return !!value && value.isObjectionRelationExpression === true;
}
