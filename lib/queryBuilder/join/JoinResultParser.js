'use strict';

const { JoinResultColumn } = require('./JoinResultColumn');
const { groupBy } = require('../../utils/objectUtils');

class JoinResultParser {
  constructor({ tableTree, omitColumnAliases = [] }) {
    this.tableTree = tableTree;
    this.omitColumnAliases = new Set(omitColumnAliases);

    this.columnsByTableNode = null;
    this.parentMap = null;
    this.rootModels = null;
  }

  static create(args) {
    return new JoinResultParser(args);
  }

  parse(flatRows) {
    if (!Array.isArray(flatRows) || flatRows.length === 0) {
      return flatRows;
    }

    this._checkIdColumns(flatRows[0]);

    this.columnsByTableNode = this._createColumns(flatRows[0]);
    this.parentMap = new Map();
    this.rootModels = [];

    for (const flatRow of flatRows) {
      this._parseNode(this.tableTree.rootNode, flatRow);
    }

    return this.rootModels;
  }

  _parseNode(tableNode, flatRow, parentModel = null, parentKey = null) {
    const id = tableNode.getIdFromFlatRow(flatRow);

    if (id === null) {
      return;
    }

    const key = getKey(parentKey, id, tableNode);
    let model = this.parentMap.get(key);

    if (!model) {
      model = this._createModel(tableNode, flatRow);

      this._addToParent(tableNode, model, parentModel);
      this.parentMap.set(key, model);
    }

    for (const childNode of tableNode.childNodes) {
      this._parseNode(childNode, flatRow, model, key);
    }
  }

  _createModel(tableNode, flatRow) {
    const row = {};
    const columns = this.columnsByTableNode.get(tableNode);

    if (columns) {
      for (const column of columns) {
        if (!this.omitColumnAliases.has(column.columnAlias)) {
          row[column.name] = flatRow[column.columnAlias];
        }
      }
    }

    const model = tableNode.modelClass.fromDatabaseJson(row);

    for (const childNode of tableNode.childNodes) {
      if (childNode.relation.isOneToOne()) {
        model[childNode.relationProperty] = null;
      } else {
        model[childNode.relationProperty] = [];
      }
    }

    return model;
  }

  _addToParent(tableNode, model, parentModel) {
    if (tableNode.parentNode) {
      if (tableNode.relation.isOneToOne()) {
        parentModel[tableNode.relationProperty] = model;
      } else {
        parentModel[tableNode.relationProperty].push(model);
      }
    } else {
      // Root model. Add to root list.
      this.rootModels.push(model);
    }
  }

  _checkIdColumns(row) {
    for (const tableNode of this.tableTree.nodes) {
      const idColumns = tableNode.modelClass.getIdColumnArray();
      const hasIdColumns =
        idColumns.length > 0 &&
        idColumns.every((column) =>
          Object.prototype.hasOwnProperty.call(row, tableNode.getColumnAliasForColumn(column)),
        );

      if (!hasIdColumns) {
        throw new Error(
          `withGraphJoined: the id column(s) [${idColumns.join(', ')}] of model ${tableNode.modelClass.name} ` +
            `are missing from the result, so the joined rows can't be grouped into models. ` +
            `withGraphJoined requires all models in the relation expression to have a primary key ` +
            `(idColumn) that exists in the table. Use withGraphFetched for models without one.`,
        );
      }
    }
  }

  _createColumns(row) {
    const columns = Object.keys(row).map((columnAlias) =>
      JoinResultColumn.create({ tableTree: this.tableTree, columnAlias }),
    );

    return groupBy(columns, getTableNode);
  }
}

function getTableNode(column) {
  return column.tableNode;
}

function getKey(parentKey, id, tableNode) {
  if (parentKey !== null) {
    return `${parentKey}/${tableNode.relationProperty}/${id}`;
  } else {
    return `/${id}`;
  }
}

module.exports = {
  JoinResultParser,
};
