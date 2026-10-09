'use strict';

const { isString, isObject } = require('../../../utils/objectUtils');
const { isKnexQueryBuilder } = require('../../../utils/knexUtils');

const ALIAS_REGEX = /\s+as\s+/i;

class Selection {
  constructor(table, column, alias) {
    this.table = table;
    this.column = column;
    this.alias = alias;
    this.keepsSelectAll = false;
  }

  get name() {
    return this.alias || this.column;
  }

  static create(selection) {
    if (isObject(selection)) {
      if (selection.isObjectionSelection) {
        return selection;
      } else if (selection.isObjectionReferenceBuilder) {
        return createSelectionFromReference(selection);
      } else if (selection.isObjectionRawBuilder) {
        return createSelectionFromRaw(selection);
      } else if (selection.isObjectionQueryBuilderBase) {
        return createSelectionFromQueryBuilder(selection);
      } else if (isKnexQueryBuilder(selection)) {
        return createSelectionFromAlias(selection._single.as);
      } else {
        return null;
      }
    } else if (isString(selection)) {
      return createSelectionFromString(selection);
    } else {
      return null;
    }
  }

  /**
   * Returns true if `selectionInBuilder` causes `selectionToTest` to be selected.
   *
   * Examples that return true:
   *
   * doesSelect(Person.query(), '*', 'name')
   * doesSelect(Person.query(), 'Person.*', 'name')
   * doesSelect(Person.query(), 'name', 'name')
   * doesSelect(Person.query(), 'name', 'Person.name')
   */
  static doesSelect(builder, selectionInBuilder, selectionToTest) {
    selectionInBuilder = Selection.create(selectionInBuilder);
    selectionToTest = Selection.create(selectionToTest);

    if (selectionInBuilder.column === '*') {
      if (selectionInBuilder.table) {
        if (selectionToTest.column === '*') {
          return isSameTable(builder, selectionToTest.table, selectionInBuilder.table);
        } else {
          return (
            selectionToTest.table === null ||
            isSameTable(builder, selectionToTest.table, selectionInBuilder.table)
          );
        }
      } else {
        return true;
      }
    } else {
      const selectionInBuilderTable = selectionInBuilder.table || builder.tableRef();

      if (selectionToTest.column === '*') {
        return false;
      } else {
        return (
          selectionToTest.column === selectionInBuilder.column &&
          (selectionToTest.table === null ||
            isSameTable(builder, selectionToTest.table, selectionInBuilderTable))
        );
      }
    }
  }
}

Object.defineProperties(Selection.prototype, {
  isObjectionSelection: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

// Table names that only differ in a way that knex's `wrapIdentifier` mapping
// (for example `knexSnakeCaseMappers()`) cancels out refer to the same table:
// `dataExtension` and `data_extension` both end up as `data_extension`.
function isSameTable(builder, table1, table2) {
  if (table1 === table2) {
    return true;
  } else if (!table1 || !table2) {
    return false;
  }

  const knex = builder.unsafeKnex();
  const wrapIdentifier = knex && knex.client && knex.client.config.wrapIdentifier;

  if (!wrapIdentifier) {
    return false;
  }

  const mapTable = (table) =>
    table
      .split('.')
      .map((part) => wrapIdentifier(part, identity))
      .join('.');

  return mapTable(table1) === mapTable(table2);
}

function identity(value) {
  return value;
}

function createSelectionFromReference(ref) {
  return new Selection(ref.tableName, ref.column, ref.alias);
}

function createSelectionFromRaw(raw) {
  if (raw.alias) {
    return new Selection(null, null, raw.alias);
  } else {
    return null;
  }
}

// Subqueries aliased using `as()` select a column with the alias as name.
function createSelectionFromQueryBuilder(builder) {
  const asOperation = builder.findLastOperation('as');
  return createSelectionFromAlias(asOperation && asOperation.args[0]);
}

function createSelectionFromAlias(alias) {
  if (isString(alias)) {
    const selection = new Selection(null, null, alias);
    // These selections weren't recognized in the past. To not change which
    // other columns `withGraphJoined` selects, they don't count as explicit
    // selections when deciding whether all columns are selected.
    selection.keepsSelectAll = true;
    return selection;
  } else {
    return null;
  }
}

function createSelectionFromString(selection) {
  let table = null;
  let column = null;
  let alias = null;

  if (ALIAS_REGEX.test(selection)) {
    const parts = selection.split(ALIAS_REGEX);

    selection = parts[0].trim();
    alias = parts[1].trim();
  }

  const dotIdx = selection.lastIndexOf('.');

  if (dotIdx !== -1) {
    table = selection.substr(0, dotIdx);
    column = selection.substr(dotIdx + 1);
  } else {
    column = selection;
  }

  return new Selection(table, column, alias);
}

module.exports = {
  Selection,
};
