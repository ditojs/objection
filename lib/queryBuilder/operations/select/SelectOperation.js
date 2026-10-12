import { flatten, isString, isPlainObject } from '../../../utils/objectUtils.js';
import { Selection } from './Selection.js';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation.js';

const COUNT_REGEX = /count/i;
const ALIAS_REGEX = /\s+as\s+/i;

const AGGREGATE_METHODS = new Set([
  'count',
  'countDistinct',
  'min',
  'max',
  'sum',
  'sumDistinct',
  'avg',
  'avgDistinct',
]);

export class SelectOperation extends ObjectionToKnexConvertingOperation {
  constructor(name, opt) {
    super(name, opt);
    this.selections = [];
    // Aggregates select their aliases, not the columns they're passed.
    this.isAggregate = AGGREGATE_METHODS.has(name);
    // `distinctOn()` makes the rows distinct on its columns, it doesn't select them.
    this.isDistinctOn = name === 'distinctOn';
  }

  onAdd(builder, args) {
    const selections = flatten(args);

    // Don't add an empty selection. Empty list is accepted for `count`, `countDistinct`
    // etc. because knex apparently supports it.
    if (selections.length === 0 && !COUNT_REGEX.test(this.name)) {
      return false;
    }

    const ret = super.onAdd(builder, selections);

    if (this.isAggregate) {
      this.selections = getAggregateAliases(selections).map(
        (alias) => new Selection(null, null, alias),
      );
    } else if (!this.isDistinctOn) {
      for (const selection of selections) {
        const selectionInstance = Selection.create(selection);

        if (selectionInstance) {
          this.selections.push(selectionInstance);
        }
      }
    }

    return ret;
  }

  onBuildKnex(knexBuilder, builder) {
    return knexBuilder[this.name].apply(knexBuilder, this.getKnexArgs(builder));
  }

  findSelection(builder, selectionToFind) {
    const selectionInstanceToFind = Selection.create(selectionToFind);

    if (!selectionInstanceToFind) {
      return null;
    }

    for (const selection of this.selections) {
      if (Selection.doesSelect(builder, selection, selectionInstanceToFind)) {
        return selection;
      }
    }

    return null;
  }

  clone() {
    const clone = super.clone();
    clone.selections = this.selections.slice();
    return clone;
  }
}

// Returns the aliases of the columns an aggregate selects, supporting the same
// argument forms as knex: `count('col as alias')`, `count('col', { as: 'alias' })`
// and `count({ alias: 'col' })`. Aggregates without an alias are skipped, as
// their column name differs between databases.
function getAggregateAliases([column, options]) {
  if (isString(column) && ALIAS_REGEX.test(column)) {
    return [column.split(ALIAS_REGEX)[1].trim()];
  } else if (isPlainObject(options) && isString(options.as)) {
    return [options.as];
  } else if (isPlainObject(column)) {
    return Object.keys(column);
  } else {
    return [];
  }
}
