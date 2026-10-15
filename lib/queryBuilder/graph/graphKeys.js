import { nonStrictEquals } from '../../utils/objectUtils.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { formatPath } from './GraphNode.js';

const UNRESOLVED = Symbol('unresolved');

// Resolve the keys and `#ref{}` values of the models of a planned graph.

// The keys of the rows of a planned graph, as slots: Each place of the graph
// that puts a row into a relation through a key says that a key column of the
// row, or of its owner for a BelongsToOne row, equals a column of the other
// side. These columns form a slot. Its anchors give it its value: the columns
// that no place sets, and the values that a node gives whose own place doesn't
// set them. Anchors have to agree. A slot without any takes the common current
// value of the rows its places read. Each place writes the columns that it
// sets, and reads the others, from their slots.
export class GraphKeys {
  constructor(plan) {
    this.plan = plan;
    this.activeNodes = new Set(plan.activeNodes);
    this.rows = new Map();
    this.nodesByRow = new Map();
    this.cells = new Map();
    // The props that each node only reads, and that other nodes write:
    this.readProps = new Map();
    // The columns that each place sets or reads:
    this.placeCells = new Map();
    // The rows that the graph inserts, and the ones that it inserted already:
    this.insertRows = new Set();
    this.insertedRows = new Set();
    // The nodes whose `#ref{}` values are resolved:
    this.resolvedNodes = new Set();

    // The rows are decided before the inserts give new rows their ids:
    for (const node of plan.activeNodes) {
      const row = this._getRow(node);

      if (plan.actions.get(node) === 'insert') {
        this.insertRows.add(row);
      }
    }

    // The columns that a whole `#ref{}` gives the rows at their places, see
    // `hasWholeReference()`:
    this.wholeReferences = new Set(
      plan.activeNodes.flatMap((node) =>
        node.propertyReferences
          .filter(({ path }) => hasWholeReference(plan, node, path[0]))
          .map(({ path }) => this._getPlaceKey(node, path[0])),
      ),
    );

    // Places that the graph ignores, and many-to-many places, only read:
    for (const node of plan.activeNodes) {
      const { parent, relation } = node;

      if (parent && !node.toBeUnrelatedOrDeleted) {
        const [target, targetProp, source, sourceProp] =
          relation.keySide === 'related'
            ? [node, relation.relatedProp, parent, relation.ownerProp]
            : hasOwnerKey(relation)
              ? [parent, relation.ownerProp, node, relation.relatedProp]
              : [];

        if (target && !isPlacingReference(plan, target) && plan.actions.get(node) !== 'ignore') {
          this._addPlace(node, target, targetProp, source, sourceProp);
        } else if (relation.keySide !== 'owner' || hasOwnerKey(relation)) {
          // Arrays of keys are written by `setKeyArrays()`. Join rows read the
          // keys of both sides, and wait for them like the other places:
          const cells = [
            ...this._addCells(parent, this._getCells(parent, relation.ownerProp)),
            ...(relation.keySide === 'join'
              ? this._addCells(node, this._getCells(node, relation.relatedProp))
              : []),
          ];

          if (relation.keySide === 'join') {
            for (const cell of cells) {
              cell.placeNodes.add(node);
            }
          }
        }
      }
    }

    // The key columns that the plan clears, with the nodes that clear them:
    // rows that relations leave out, and the keys of removed BelongsToOne rows.
    // The places of a node read them as `null` if another node clears them:
    this.clearingNodes = new Map();
    const addClearingNode = (row, prop, node) =>
      prop.props.forEach((_, i) => {
        const key = this._getKey(row, prop, i);
        this.clearingNodes.set(key, (this.clearingNodes.get(key) || new Set()).add(node));
      });

    for (const currentNode of plan.activeCurrentNodes) {
      const { relation, parent } = currentNode;

      if (relation?.keySide === 'related' && plan.actions.get(currentNode) === 'unrelate') {
        addClearingNode(currentNode.rowKey, relation.relatedProp, parent.node);
      }
    }

    for (const node of plan.activeNodes) {
      for (const relation of plan.getRemovedOwnerRelations(node)) {
        addClearingNode(this._getRow(node), relation.ownerProp, node);
      }
    }

    this._checkSlots();
  }

  // Bind the columns of the rows of the inserted `nodes` to their values.
  setInserted(nodes) {
    for (const node of nodes) {
      this.insertedRows.add(this.rows.get(node));
    }
  }

  // Fill the columns that the place of `node` sets or reads with the values of
  // their slots, as far as they're known.
  fill(node) {
    for (const cell of this.placeCells.get(node) || []) {
      const value = this._getSlotValue(cell);

      // A place that only reads a column that other nodes write leaves the
      // write to them:
      if (
        !cell.setNodes.has(node) &&
        cell.prop.getProp(node.obj, cell.index) === undefined &&
        (cell.setNodes.size > 0 ||
          this._isCleared(cell) ||
          this._getGivenValues(cell).value !== undefined)
      ) {
        let readProps = this.readProps.get(node);

        if (!readProps) {
          readProps = new Set();
          this.readProps.set(node, readProps);
        }

        readProps.add(cell.prop.props[cell.index]);
      }

      if (value !== undefined) {
        cell.prop.setProp(node.obj, cell.index, value);
      }
    }
  }

  // Return the props of `node` that the places of its row set.
  getFilledProps(node) {
    return [...(this.placeCells.get(node) || [])]
      .filter(({ setNodes }) => setNodes.size > 0)
      .map(({ prop, index }) => prop.props[index]);
  }

  // Return true if a place other than the places of the row of `node` through
  // its BelongsToOne `relation` sets the key of the relation, e.g. the place
  // that moves the row.
  isSetByOtherPlaces(node, relation) {
    const row = this._getRow(node);
    return relation.ownerProp.props.some((_, i) =>
      [...(this.cells.get(this._getKey(row, relation.ownerProp, i))?.placeNodes || [])].some(
        (other) => !(other.relation === relation && this._getRow(other.parent) === row),
      ),
    );
  }

  // Return the values of the key columns `prop` of the row of `node`.
  getProps(node, prop) {
    return this._getCells(node, prop).map((cell) => this._getSlotValue(cell));
  }

  // Return the values of the key columns `prop` of the row of `node` at which
  // its relations are found before the writes: the current values of the rows
  // that give the final ones, as rows follow a key that changes with them, or
  // without such rows, the current value of the row itself. Clears don't count,
  // as the removals of the relations that are read cause them. Keys of new rows
  // have no related rows yet.
  getReadProps(node, prop) {
    return this._getCells(node, prop).map((cell) => {
      const values = this._getAnchorCells(cell.slot).map((anchor) =>
        this.insertRows.has(anchor.row)
          ? null
          : (this._getRowValue(anchor) ?? this._getAnchorValue(anchor)),
      );
      const value = this._getSlotValue(cell);
      return values.length > 0
        ? (values.find((other) => nonStrictEquals(other, value)) ?? values[0])
        : this._getRowValue(cell);
    });
  }

  // Return true if `node` only reads its key column `prop`, which other nodes
  // write, so that it leaves the write to them.
  isOnlyRead(node, prop) {
    return !!this.readProps.get(node)?.has(prop);
  }

  // Return true if a place of `node` sets the key column `prop` of its row:
  isSet(node, prop, index) {
    return !!this.cells.get(this._getKey(this._getRow(node), prop, index))?.setNodes.has(node);
  }

  // Return the nodes whose inserts or `#ref{}` values bind the slots of the
  // columns that the place of `node` sets or reads.
  waitsFor(node) {
    const waits = [];

    for (const cell of this.placeCells.get(node) || []) {
      for (const anchorCell of this._getAnchorCells(cell.slot)) {
        const { row, prop, index } = anchorCell;
        anchorCell.waitedNodes ??= this.nodesByRow
          .get(row)
          .filter(
            (other) =>
              (this.insertRows.has(row) && this.plan.actions.get(other) === 'insert') ||
              this._hasReference(other, prop, index),
          );

        for (const other of anchorCell.waitedNodes) {
          if (this.rows.get(other) !== this.rows.get(node)) {
            waits.push({ node: other, prop: cell.prop.props[cell.index] });
          }
        }
      }
    }

    return waits;
  }

  // The place of `node` gives `target` the key of `source`, for each column of
  // the relation:
  _addPlace(node, target, targetProp, source, sourceProp) {
    const targetCells = this._getCells(target, targetProp);
    const sourceCells = this._getCells(source, sourceProp);

    // A row below itself, e.g. in its own `siblings`, restates its own key and
    // writes nothing:
    if (targetCells.some((cell, i) => cell !== sourceCells[i])) {
      this._addCells(target, targetCells);
      this._addCells(source, sourceCells);

      targetCells.forEach((cell, i) => {
        sourceCells[i].readerNodes.add(source);

        // A whole `#ref{}` value wins over the key of its place, also where the
        // place lists the row again:
        if (!this.wholeReferences.has(this._getPlaceKey(target, cell.prop.props[cell.index]))) {
          cell.setNodes.add(target);
          cell.placeNodes.add(node);
          joinCells(cell, sourceCells[i]);
        }
      });
    }
  }

  // The key of a column of the row of `node` at its place: the row of its
  // parent and the relation.
  _getPlaceKey(node, prop) {
    const { parent, relation } = node;
    return `${this._getRow(node)}|${parent ? this._getRow(parent) : ''}|${relation?.name}|${prop}`;
  }

  _addCells(node, cells) {
    let placeCells = this.placeCells.get(node);

    if (!placeCells) {
      placeCells = new Set();
      this.placeCells.set(node, placeCells);
    }

    for (const cell of cells) {
      placeCells.add(cell);
    }

    return cells;
  }

  _getCells(node, prop) {
    return prop.props.map((_, i) => this._getCell(node, prop, i));
  }

  // The row of `node`:
  _getRow(node) {
    let row = this.rows.get(node);

    if (row === undefined) {
      // A `#ref` model has the row of the model it refers to, and a new model
      // a row of its own:
      const { referencedNode } = node;
      row = referencedNode
        ? this._getRow(referencedNode)
        : node.obj.$hasId()
          ? node.rowKey
          : `new:${this.rows.size}`;
      this.rows.set(node, row);

      const nodes = this.nodesByRow.get(row);

      if (nodes) {
        nodes.push(node);
      } else {
        this.nodesByRow.set(row, [node]);
      }
    }

    return row;
  }

  _getKey(row, prop, index) {
    return `${row}|${prop.propDescription(index)}`;
  }

  _getCell(node, prop, index) {
    const row = this._getRow(node);
    const key = this._getKey(row, prop, index);
    let cell = this.cells.get(key);

    if (!cell) {
      cell = {
        key,
        row,
        node,
        prop,
        index,
        isId: node.modelClass.getIdPropertyArray().includes(prop.props[index]),
        setNodes: new Set(),
        placeNodes: new Set(),
        readerNodes: new Set(),
        slot: null,
      };
      cell.slot = { cells: [cell] };
      this.cells.set(key, cell);
    }

    return cell;
  }

  // The cells that give a slot its value, known once the slots are built: the
  // ones that no place sets, and the ones that a node gives whose own place
  // doesn't set them.
  _getAnchorCells(slot) {
    return (slot.anchorCells ??= slot.cells.filter(
      (cell) => cell.setNodes.size === 0 || this._getGivenValues(cell).value !== undefined,
    ));
  }

  // The values that the nodes of a row give a column that their own places
  // don't set, as the graph gives them: `value` from any write, `writtenValue`
  // from a patch or relate. A `#ref{}` is `UNRESOLVED` until it's resolved.
  _getGivenValues(cell) {
    if (!cell.givenValues) {
      const { row, prop, index, setNodes } = cell;
      const { actions, graphOptions } = this.plan;
      const givenValues = {};

      for (const node of this.nodesByRow.get(row)) {
        const action = actions.get(node);

        if (
          !setNodes.has(node) &&
          !isPlacingReference(this.plan, node) &&
          // A whole `#ref{}` doesn't win over the key of another place:
          !(setNodes.size > 0 && hasWholeReference(this.plan, node, prop.props[index])) &&
          ['insert', 'patch', 'relate'].includes(action) &&
          !node.toBeUnrelatedOrDeleted &&
          (action === 'insert' || graphOptions.shouldPatch(node) || graphOptions.shouldUpdate(node))
        ) {
          const value = this._hasReference(node, prop, index)
            ? UNRESOLVED
            : (prop.getProp(node.obj, index) ??
              (node.referencedNode && !setNodes.has(node.referencedNode)
                ? prop.getProp(node.referencedNode.obj, index)
                : undefined));
          if (givenValues.value === undefined) {
            givenValues.value = value;
          }

          if (givenValues.writtenValue === undefined && action !== 'insert') {
            givenValues.writtenValue = value;
          }

          if (givenValues.writtenValue !== undefined) {
            break;
          }
        }
      }

      if (givenValues.value === UNRESOLVED || givenValues.writtenValue === UNRESOLVED) {
        return givenValues;
      }

      cell.givenValues = givenValues;
    }

    return cell.givenValues;
  }

  // Return true if a column of `node` holds a `#ref{}` that isn't resolved yet:
  _hasReference(node, prop, index) {
    return (
      !this.resolvedNodes.has(node) &&
      node.propertyReferences.some(({ path }) => path[0] === prop.props[index])
    );
  }

  // The value of an anchor cell: of a row that the graph inserts once it's
  // inserted, with `null` for the columns the graph doesn't give, a value that
  // a patch or relate writes, which wins over the inserted one, an id, or the
  // current value.
  _getAnchorValue(cell) {
    const { row, prop, index } = cell;
    const nodes = this.nodesByRow.get(row);
    const [node] = nodes;
    const getValue = (obj) => (obj ? prop.getProp(obj, index) : undefined);
    const { writtenValue } = this._getGivenValues(cell);

    if (this.insertRows.has(row)) {
      const insertNode = nodes.find((node) => this.plan.actions.get(node) === 'insert');
      return writtenValue ?? getValue(insertNode.obj) ?? null;
    } else if (writtenValue !== undefined) {
      return writtenValue;
    } else if (cell.isId) {
      return getValue(node.obj) ?? getValue(node.existing?.obj);
    } else {
      // A related row that isn't loaded is found by the key that its
      // BelongsToOne place reads, so that is its key:
      const relateNode = nodes.find(
        (node) =>
          this.plan.actions.get(node) === 'relate' &&
          hasOwnerKey(node.relation) &&
          node.relation.relatedProp.props.includes(prop.props[index]),
      );
      const currentValue = this._getCurrentValue(cell);
      return currentValue === undefined && relateNode ? getValue(relateNode.obj) : currentValue;
    }
  }

  // Return true if an anchor cell waits for an insert or a `#ref{}` value:
  _isWaiting(cell) {
    return (
      (this.insertRows.has(cell.row) && !this.insertedRows.has(cell.row)) ||
      this._getGivenValues(cell).writtenValue === UNRESOLVED
    );
  }

  // The value of an anchor cell that is known before the writes, as a key to
  // compare: the given value, or for the id of a new row the row itself, which
  // differs from all other values.
  _getKnownKey(cell) {
    const { row, prop, index } = cell;

    if (this.insertRows.has(row)) {
      const { value } = this._getGivenValues(cell);
      return value === UNRESOLVED
        ? undefined
        : value !== undefined
          ? `=${value}`
          : cell.isId
            ? row
            : undefined;
    } else {
      const value = this._isWaiting(cell) ? undefined : this._getAnchorValue(cell);
      return value !== undefined ? `=${value}` : undefined;
    }
  }

  // The value of the slot of `cell`, from its anchors, which agree, or without
  // any, from the current values of the columns its places read. `undefined`
  // until the inserts and `#ref{}` values that bind it are written.
  _getSlotValue({ slot }) {
    if (!('value' in slot)) {
      const cells = this._getAnchorCells(slot);

      if (cells.length === 0) {
        // Without anchors, the rows that the places read their keys from give it:
        slot.value = slot.cells
          .filter((cell) => cell.readerNodes.size > 0)
          .map((cell) => this._getCurrentValue(cell))
          .find((value) => value !== undefined);
      } else if (!cells.some((cell) => this._isWaiting(cell))) {
        // Once nothing waits, the value doesn't change anymore:
        slot.value = cells
          .map((cell) => this._getAnchorValue(cell))
          .find((value) => value !== undefined);
      }
    }

    return slot.value;
  }

  // The current value of the column of `cell`, `null` once it's cleared:
  _getCurrentValue(cell) {
    return this._isCleared(cell) ? null : this._getRowValue(cell);
  }

  // The value of the column of `cell` in its row before any clears: of its
  // current row, or what an ignored node gives it, as the graph doesn't write
  // it there:
  _getRowValue(cell) {
    const { row, prop, index } = cell;

    for (const node of this.nodesByRow.get(row)) {
      const value =
        !this.activeNodes.has(node) && prop.getProp(node.obj, index) !== undefined
          ? prop.getProp(node.obj, index)
          : node.existing
            ? prop.getProp(node.existing.obj, index)
            : undefined;

      if (value !== undefined) {
        return value;
      }
    }
  }

  // Return true if another node than the ones that read the column of `cell`
  // clears it:
  _isCleared(cell) {
    const clearingNodes = this.clearingNodes.get(cell.key);
    return (cell.isCleared ??=
      !!clearingNodes && [...clearingNodes].some((node) => !cell.readerNodes.has(node)));
  }

  // Throw for slots whose anchors, or whose rows without any, give different
  // values that are known before the writes.
  _checkSlots() {
    const slots = new Set([...this.cells.values()].map((cell) => cell.slot));

    for (const slot of [...slots].filter(({ cells }) => cells.length > 1)) {
      const anchorCells = this._getAnchorCells(slot);
      const readCells = slot.cells.filter((cell) => cell.readerNodes.size > 0);
      const placingCell = slot.cells.find((cell) => cell.setNodes.size > 0);
      // A key that one node clears can't place the rows of another node:
      const clearedCell = (anchorCells.length > 0 ? anchorCells : readCells).find((cell) =>
        this._isCleared(cell),
      );

      if (clearedCell && placingCell) {
        const { prop, index, node } = clearedCell;
        throw node.modelClass.createValidationError({
          type: ValidationErrorType.InvalidGraph,
          message: `the graph clears ${prop.props[index]} of the ${node.modelClass.name} at ${formatPath(node.dataPathKey)}, which places rows at ${formatPath([...placingCell.placeNodes][0].dataPathKey)}`,
        });
      }

      const known = (
        anchorCells.length > 0
          ? anchorCells.map((cell) => [cell, this._getKnownKey(cell)])
          : readCells.map((cell) => [cell, this._getCurrentValue(cell)])
      ).filter(([, value]) => value !== undefined);
      const [cell, value] = known[0] || [];
      const [otherCell] = known.find(([, other]) => String(other) !== String(value)) || [];

      if (otherCell) {
        // Name the column that the places set, e.g. not the id they read it from:
        const { prop, index, node } = placingCell || cell;
        throw node.modelClass.createValidationError({
          type: ValidationErrorType.InvalidGraph,
          message: `the graph gives ${prop.props[index]} of one ${node.modelClass.name} two values, at ${formatPath(cell.node.dataPathKey)} and at ${formatPath(otherCell.node.dataPathKey)}`,
        });
      }
    }
  }
}

// Join the slots of both cells, moving the cells of the smaller one:
function joinCells(cell, otherCell) {
  const [slot, otherSlot] =
    cell.slot.cells.length >= otherCell.slot.cells.length
      ? [cell.slot, otherCell.slot]
      : [otherCell.slot, cell.slot];

  if (slot !== otherSlot) {
    for (const other of otherSlot.cells) {
      other.slot = slot;
      slot.cells.push(other);
    }
  }
}

// Return true if `node` is a `#ref` model in a many-to-many or BelongsToOne
// relation whose model writes its row, so that it only places the row there,
// and neither sets nor gives the keys of that row.
function isPlacingReference(plan, node) {
  const { referencedNode, relation } = node;
  return (
    !!referencedNode &&
    (relation.keySide === 'join' || hasOwnerKey(relation)) &&
    plan.isCoveredByModel(node)
  );
}

// Return true if `node` gives `prop` a whole `#ref{}` value that wins over the
// key that its place in its parent sets, or that any place sets when `node` is
// inserted (Vincit#1378). The column then keeps that value for all its readers.
function hasWholeReference(plan, node, prop) {
  return (
    (plan.actions.get(node) === 'insert' ||
      (node.relation?.keySide === 'related' && node.relation.relatedProp.props.includes(prop))) &&
    node.propertyReferences.some(
      ({ path, isWholeValue }) => isWholeValue && path.length === 1 && path[0] === prop,
    )
  );
}

// Return true if the values of two keys differ, with missing values as `null`.
export function isOtherKey(values, otherValues) {
  return values.some((value, i) => !nonStrictEquals(value ?? null, otherValues[i] ?? null));
}

export function hasOwnerKey(relation) {
  return relation.keySide === 'owner' && relation.isOneToOne();
}

// Return true if both relations keep the keys of their related rows in the same
// columns, also the same JSON paths of them.
export function hasSameKey(relation, otherRelation) {
  const { relatedProp } = relation;
  const otherProp = otherRelation?.keySide === 'related' ? otherRelation.relatedProp : null;
  return (
    !!otherProp &&
    relation.relatedModelClass.getTableName() === otherRelation.relatedModelClass.getTableName() &&
    hasSameColumns(relatedProp, otherProp)
  );
}

// Return true if both props are the same columns, also the same JSON paths of
// them.
export function hasSameColumns(prop, otherProp) {
  return (
    prop.size === otherProp.size &&
    prop.props.every((_, i) => prop.propDescription(i) === otherProp.propDescription(i))
  );
}
