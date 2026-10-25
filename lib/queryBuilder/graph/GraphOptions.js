import { RelationExpression } from '../RelationExpression.js';
import { isPlainObject, isString } from '../../utils/objectUtils.js';

// The options that are matched against the relation path of each node, see
// `has()`.
const NODE_OPTION_NAMES = [
  'noRelate',
  'noUnrelate',
  'noInsert',
  'noUpdate',
  'noDelete',
  'update',
  'relate',
  'unrelate',
  'insertMissing',
];

const OPTION_NAMES = [...NODE_OPTION_NAMES, 'fetchStrategy', 'allowRefs', 'allowMarkers', 'strict'];

// `insertGraph` never fetches, updates or removes existing rows, so only the
// options about inserting and relating apply to it, and the others are set:
const INSERT_OPTION_NAMES = ['relate', 'noRelate', 'noInsert', 'allowRefs', 'strict'];
const INSERT_ONLY_OPTIONS = {
  noUpdate: true,
  noDelete: true,
  noUnrelate: true,
  insertMissing: true,
};

// In strict mode, `root` and `relations` replace the node options. Each takes
// settings for the four cases of the diff between the graph and the stored
// relation, see `getSetting()`:
const STRICT_OPTION_NAMES = [
  'strict',
  'root',
  'relations',
  'fetchStrategy',
  'allowRefs',
  'allowMarkers',
];
const STRICT_INSERT_OPTION_NAMES = ['strict', 'root', 'relations', 'allowRefs'];

const SETTING_VALUES = {
  removed: ['preserve', 'unrelate', 'delete'],
  added: ['relate', 'insert', 'relateOrInsert'],
  kept: ['patch', 'update', 'preserve'],
  new: ['insert', 'throw'],
};
// Root rows are never removed, and only inserted if they don't exist:
const ROOT_SETTING_VALUES = {
  added: ['insert'],
  kept: SETTING_VALUES.kept,
  new: SETTING_VALUES.new,
};
const INSERT_SETTING_VALUES = { added: ['relate', 'insert'], new: SETTING_VALUES.new };
const INSERT_ROOT_SETTING_VALUES = { added: ['insert'], new: SETTING_VALUES.new };

const DEFAULT_SETTINGS = { removed: 'delete', kept: 'patch', new: 'insert' };
const INSERT_DEFAULT_SETTINGS = { added: 'insert', new: 'insert' };

// The node options that `has()` answers from the settings in strict mode, as
// the setting and the values that turn them on. `noRelate` has no setting.
const SETTING_OPTIONS = {
  relate: ['added', ['relate', 'relateOrInsert']],
  insertMissing: ['added', ['insert', 'relateOrInsert']],
  unrelate: ['removed', ['unrelate']],
  noDelete: ['removed', ['preserve']],
  noUnrelate: ['removed', ['preserve']],
  update: ['kept', ['update']],
  noUpdate: ['kept', ['preserve']],
  noInsert: ['new', ['throw']],
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
    this.options = options.strict ? options : parseRelationExpressions(options);
    this.insertOnly = insertOnly;
    // The settings of `relations` by relation expression, in their order:
    this.relations = options.strict ? parseRelations(options.relations) : [];
  }

  isStrict() {
    return !!this.options.strict;
  }

  isFetchStrategy(strategy) {
    if (!this.options.fetchStrategy) {
      return strategy === FetchStrategy.OnlyNeeded;
    } else {
      return this.options.fetchStrategy === strategy;
    }
  }

  isInsertOnly() {
    return this.insertOnly;
  }

  // Whether a node that the graph relates or patches is written with `patch()`
  // or `update()`. With `noUpdate`, it's neither, and only the foreign keys of
  // its relates and BelongsToOneRelations are patched.
  shouldPatch(node) {
    return !this.has(node, 'noUpdate') && !this.has(node, 'update');
  }

  shouldUpdate(node) {
    return !this.has(node, 'noUpdate') && this.has(node, 'update');
  }

  allowRefs() {
    return !!this.options.allowRefs;
  }

  allowMarkers() {
    return !!this.options.allowMarkers;
  }

  // Whether the option applies to the relation path of `node`.
  has(node, optionName) {
    if (this.insertOnly && INSERT_ONLY_OPTIONS[optionName]) {
      return true;
    } else if (this.isStrict()) {
      const [key, values] = SETTING_OPTIONS[optionName] ?? [];
      return !!key && values.includes(this.getSetting(node, key));
    }

    const option = this.options[optionName];

    return isRelationExpression(option)
      ? matchesRelationExpression(option, node.relationPath)
      : Array.isArray(option)
        ? option.includes(node.relationPathKey)
        : !!option;
  }

  // The value of the strict mode setting `key` for `node`: `root` sets it for
  // the root rows, and the entries of `relations` whose expressions match the
  // relation path of `node` set it in their order, so later entries win.
  getSetting(node, key) {
    let value = node.relationPath.length === 0 ? this.options.root?.[key] : undefined;

    for (const { expression, settings } of this.relations) {
      if (settings[key] !== undefined && matchesRelationExpression(expression, node.relationPath)) {
        value = settings[key];
      }
    }

    return value ?? (this.insertOnly ? INSERT_DEFAULT_SETTINGS : DEFAULT_SETTINGS)[key];
  }
}

// Reject misspelled options, options of `upsertGraph` passed to `insertGraph`
// and options of the other mode, which would otherwise be ignored silently
// (#84). Options and settings set to `undefined` count as not set.
function checkForUnknownOptions(options, insertOnly) {
  const [method, optionNames] = insertOnly
    ? ['insertGraph', options.strict ? STRICT_INSERT_OPTION_NAMES : INSERT_OPTION_NAMES]
    : ['upsertGraph', options.strict ? STRICT_OPTION_NAMES : OPTION_NAMES];

  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined && !optionNames.includes(name)) {
      throw new Error(
        `"${name}" is not an option of ${method}()${options.strict ? ' in strict mode' : ''}. ` +
          `Valid options are: ${optionNames.join(', ')}.`,
      );
    }
  }

  if (options.root !== undefined) {
    checkSettings(
      options.root,
      insertOnly ? INSERT_ROOT_SETTING_VALUES : ROOT_SETTING_VALUES,
      'root',
      method,
    );
  }

  if (options.relations !== undefined) {
    checkObject(options.relations, 'relations', method);

    for (const [key, settings] of Object.entries(options.relations)) {
      checkSettings(
        settings,
        insertOnly ? INSERT_SETTING_VALUES : SETTING_VALUES,
        `relations["${key}"]`,
        method,
      );
    }
  }
}

function checkSettings(settings, settingValues, place, method) {
  checkObject(settings, place, method);

  for (const [key, value] of Object.entries(settings)) {
    const values = settingValues[key];

    if (value === undefined) {
      continue;
    } else if (!values) {
      throw new Error(
        `"${key}" is not a setting of ${place} in ${method}(). ` +
          `Valid settings are: ${Object.keys(settingValues).join(', ')}.`,
      );
    } else if (!values.includes(value)) {
      throw new Error(
        `"${value}" is not a value of ${key} in ${place} of ${method}(). ` +
          `Valid values are: ${values.join(', ')}.`,
      );
    }
  }
}

function checkObject(value, place, method) {
  if (!isPlainObject(value)) {
    throw new Error(`expected ${place} of ${method}() to be an object`);
  }
}

function parseRelations(relations) {
  return Object.entries(relations ?? {}).map(([key, settings]) => ({
    key,
    expression: parseRelationExpression('relations', key),
    settings,
  }));
}

// Parses the string values of the node options into relation expressions,
// once per operation, and checks the types of the other values.
function parseRelationExpressions(options) {
  const parsedOptions = { ...options };

  for (const optionName of NODE_OPTION_NAMES) {
    const option = options[optionName];

    if (isString(option)) {
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
  const createError = (message) =>
    new Error(`invalid relation expression "${expression}" in ${optionName} option: ${message}`);

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
