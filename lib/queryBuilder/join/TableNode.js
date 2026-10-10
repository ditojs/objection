import { propKey, hasProps } from '../../model/modelValues.js';

export class TableNode {
  constructor({ tableTree, modelClass, expression, parentNode = null, relation = null }) {
    this.tableTree = tableTree;
    this.modelClass = modelClass;
    this.parentNode = parentNode;
    this.relation = relation;
    this.expression = expression;
    this.childNodes = [];

    this.alias = this._calculateAlias();
    this.idGetter = this._createIdGetter();
  }

  static create(args) {
    const node = new TableNode(args);

    if (node.parentNode) {
      node.parentNode.childNodes.push(node);
    }

    return node;
  }

  get options() {
    return this.tableTree.options;
  }

  get relationProperty() {
    return this.expression.node.$name;
  }

  getReferenceForColumn(column) {
    return `${this.alias}.${column}`;
  }

  getColumnAliasForColumn(column) {
    if (this.parentNode) {
      return `${this.alias}${this.options.separator}${column}`;
    } else {
      return column;
    }
  }

  getColumnForColumnAlias(columnAlias) {
    const lastSepIndex = columnAlias.lastIndexOf(this.options.separator);

    if (lastSepIndex === -1) {
      return columnAlias;
    } else {
      return columnAlias.slice(lastSepIndex + this.options.separator.length);
    }
  }

  getIdFromFlatRow(flatRow) {
    return this.idGetter(flatRow);
  }

  getJoinTableAlias(builder) {
    if (this.relation.isObjectionManyToManyRelation) {
      return (
        builder.aliasFor(this.relation.joinTableModelClass) ||
        this.modelClass.joinTableAlias(this.alias)
      );
    } else {
      return undefined;
    }
  }

  _calculateAlias() {
    if (this.parentNode) {
      const relationName = this.expression.node.$name;
      const alias = this.options.aliases[relationName] || relationName;

      if (this.options.minimize) {
        return `_t${this.tableTree.createNextUid()}`;
      } else if (this.parentNode.parentNode) {
        return `${this.parentNode.alias}${this.options.separator}${alias}`;
      } else {
        return alias;
      }
    } else {
      return this.tableTree.rootTableAlias;
    }
  }

  _createIdGetter() {
    const columnAliases = this.modelClass
      .getIdColumnArray()
      .map((column) => this.getColumnAliasForColumn(column));

    return (flatRow) => (hasProps(flatRow, columnAliases) ? propKey(flatRow, columnAliases) : null);
  }
}
