import { nonStrictEquals } from '../../utils/objectUtils.js';
import { ValidationErrorType } from '../../model/ValidationError.js';
import { formatPath } from './GraphNode.js';
import { RelationProperty } from '../../relations/RelationProperty.js';

const UNRESOLVED = Symbol('unresolved');

// The keys of the rows of a planned graph, solved as slots:
// - row: a model with an id, existing or inserted, or the one that a `#ref` model refers to.
// - cell: one key column of a row, or one JSON path of a column.
// - place: puts a row into a relation, setting its cells or its owner's to cells it reads.
// - slot: the cells that places join, with one value from its anchors, which agree.
// - anchor: a cell that no place sets, or a value that a model gives a cell its place doesn't set.
// - clear: empties the key of an unrelated row, or of the owner of a removed BelongsToOne row.
// A slot without anchors takes the current value of the cells that its places read.
export class GraphKeys {
  constructor(plan) {
    this.plan = plan;
    this.activeNodes = new Set(plan.activeNodes);
    // The row of each node, and the rows by their keys:
    this.rows = new Map();
    this.rowsByKey = new Map();
    // The cells in their order:
    this.cells = [];
    // The props that each node only reads, and that other nodes write:
    this.readProps = new Map();
    // The cells that each place sets or reads:
    this.placeCells = new Map();
    // The nodes whose `#ref{}` values are resolved:
    this.resolvedNodes = new Set();

    // 1. The rows, decided before the inserts give new rows their ids:
    for (const node of plan.activeNodes) {
      const row = this._getRow(node);

      if (plan.actions.get(node) === 'insert') {
        row.isInsert = true;
      }
    }

    // 2. The places whose cells a whole `#ref{}` gives, see `hasWholeReference()`:
    this.wholeReferences = new Set(
      plan.activeNodes.flatMap((node) =>
        node.propertyReferences
          .filter(({ path }) => hasWholeReference(plan, node, path[0]))
          .map(({ path }) => this._getPlaceKey(node, path[0])),
      ),
    );

    // 3. The places. The ones that the graph ignores, and many-to-many places,
    // only read:
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

    // 4. The clears, with the nodes that clear the cells. The places of a node
    // read them as `null` if another node clears them:
    const addClearingNode = (row, prop, node) =>
      prop.props.forEach((_, i) => {
        const description = prop.propDescription(i);
        row.clearingNodes.set(
          description,
          (row.clearingNodes.get(description) || new Set()).add(node),
        );
      });

    for (const currentNode of plan.activeCurrentNodes) {
      const { relation, parent } = currentNode;

      if (relation?.keySide === 'related' && plan.actions.get(currentNode) === 'unrelate') {
        addClearingNode(this._getRowByKey(currentNode.rowKey), relation.relatedProp, parent.node);
      }
    }

    for (const node of plan.activeNodes) {
      for (const relation of plan.getRemovedOwnerRelations(node)) {
        addClearingNode(this._getRow(node), relation.ownerProp, node);
      }
    }

    // 5. The anchors of each slot must agree, and no clear may place rows:
    this._checkSlots();
  }

  // Bind the cells of the rows of the inserted `nodes` to their values.
  setInserted(nodes) {
    for (const node of nodes) {
      this.rows.get(node).isInserted = true;
    }
  }

  // Fill the cells that the place of `node` sets or reads with the values of
  // their slots, as far as they're known.
  fill(node) {
    for (const cell of this.placeCells.get(node) || []) {
      const value = this._getSlotValue(cell);

      // A place that only reads a cell that other nodes write leaves the
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

  // Return the cells of the row of `node` that the graph sets, unless `node`
  // only reads them:
  getSetCells(node) {
    const row = this._getRow(node);
    return [...(this.placeCells.get(node) || [])].filter(
      (cell) =>
        cell.row === row &&
        cell.setNodes.size > 0 &&
        !this.isOnlyRead(node, cell.prop.props[cell.index]),
    );
  }

  // Return true if a place other than the places of the row of `node` through
  // its BelongsToOne `relation` sets the key of the relation, e.g. the place
  // that moves the row.
  isSetByOtherPlaces(node, relation) {
    const row = this._getRow(node);
    return relation.ownerProp.props.some((_, i) =>
      [...(row.cells.get(relation.ownerProp.propDescription(i))?.placeNodes || [])].some(
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
        anchor.row.isInsert ? null : (this._getStoredValue(anchor) ?? this._getAnchorValue(anchor)),
      );
      const value = this._getSlotValue(cell);
      return values.length > 0
        ? (values.find((other) => nonStrictEquals(other, value)) ?? values[0])
        : this._getStoredValue(cell);
    });
  }

  // Return true if `node` only reads its key column `prop`, which other nodes
  // write, so that it leaves the write to them.
  isOnlyRead(node, prop) {
    return !!this.readProps.get(node)?.has(prop);
  }

  // Return true if a place of `node` sets the key column `prop` of its row:
  isSet(node, prop, index) {
    const cell = this._getRow(node).cells.get(prop.propDescription(index));
    return !!cell?.setNodes.has(node);
  }

  // Return the nodes whose inserts, `#ref{}` values or changes bind the slots
  // of the cells that the place of `node` sets or reads, and whether they
  // change them.
  waitsFor(node) {
    const { relation, parent } = node;
    const waits = [];
    const addWaits = (cell, nodes, isKeyChange) => {
      for (const other of nodes) {
        if (this.rows.get(other) !== this.rows.get(node)) {
          waits.push({ node: other, prop: cell.prop.props[cell.index], isKeyChange });
        }
      }
    };

    for (const cell of this.placeCells.get(node) || []) {
      for (const anchorCell of this._getAnchorCells(cell.slot)) {
        const { row, prop, index } = anchorCell;
        anchorCell.waitedNodes ??= row.nodes.filter(
          (other) =>
            (row.isInsert && this.plan.actions.get(other) === 'insert') ||
            this._hasReference(other, prop, index),
        );
        addWaits(cell, anchorCell.waitedNodes, false);

        // Only the places that set a cell write the changes of its slot:
        if (cell.setNodes.has(node)) {
          addWaits(cell, [this._getChangingNode(anchorCell)].filter(Boolean), true);
        }
      }
    }

    // Join rows are inserted after all rows, but read the keys of their owners,
    // which patches may change:
    if (relation?.keySide === 'join') {
      for (const cell of this._getCells(parent, relation.ownerProp)) {
        for (const anchorCell of this._getAnchorCells(cell.slot)) {
          addWaits(cell, [this._getChangingNode(anchorCell)].filter(Boolean), true);
        }
      }
    }

    return waits;
  }

  // Return the patches and relates that change the column of another row that
  // the `#ref{}` of `reference` copies into `node`, as for the keys:
  getChangingNodes(node, { referencedNode, refPath }) {
    const { modelClass } = referencedNode;
    const [propName] = refPath;
    // The cell of a key on the column, or one of its own:
    const cell =
      [...this._getRow(referencedNode).cells.values()].find(
        ({ prop, index }) => prop.props[index] === propName && prop.isColumn(index),
      ) ??
      this._getCell(
        referencedNode,
        new RelationProperty(
          `${modelClass.getTableName()}.${modelClass.propertyNameToColumnName(propName)}`,
          () => modelClass,
        ),
        0,
      );
    return this._getAnchorCells(cell.slot)
      .map((anchorCell) => this._getChangingNode(anchorCell))
      .filter((other) => other && this.rows.get(other) !== this.rows.get(node));
  }

  // Return the patch or relate that changes the value of an anchor cell, or
  // may change it, when its row isn't loaded. A foreign key may reference the
  // cell, so the rows that read the new value wait for it (#428). Ids don't
  // change, see `checkChangedIds()`, and rows without ids are found by the
  // values that the graph gives them.
  _getChangingNode(cell) {
    const { writtenValue, writingNode } = this._getGivenValues(cell);
    return writingNode &&
      !cell.isId &&
      (cell.row.isInsert || (writingNode.referencedNode || writingNode).obj.$hasId()) &&
      !nonStrictEquals(writtenValue, this._getStoredValue(cell))
      ? writingNode
      : null;
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
        // place lists the row again. Most graphs have none, so skip the keys:
        if (
          this.wholeReferences.size === 0 ||
          !this.wholeReferences.has(this._getPlaceKey(target, cell.prop.props[cell.index]))
        ) {
          cell.setNodes.add(target);
          cell.placeNodes.add(node);
          joinCells(cell, sourceCells[i]);
        }
      });
    }
  }

  // The key of a cell of the row of `node` at its place: the row of its
  // parent and the relation.
  _getPlaceKey(node, prop) {
    const { parent, relation } = node;
    return `${this._getRow(node).key}|${parent ? this._getRow(parent).key : ''}|${relation?.name}|${prop}`;
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

    if (!row) {
      // A `#ref` model has the row of the model it refers to, and a new model
      // a row of its own:
      const { referencedNode } = node;
      row = referencedNode
        ? this._getRow(referencedNode)
        : this._getRowByKey(node.obj.$hasId() ? node.rowKey : `new:${this.rows.size}`);
      row.nodes.push(node);
      this.rows.set(node, row);
    }

    return row;
  }

  // The row with the `key` of its table and id, or of a new row:
  _getRowByKey(key) {
    let row = this.rowsByKey.get(key);

    if (!row) {
      row = {
        key,
        nodes: [],
        // The cells by their props, and the nodes that clear them:
        cells: new Map(),
        clearingNodes: new Map(),
        // Whether the graph inserts the row, and whether it is inserted:
        isInsert: false,
        isInserted: false,
      };
      this.rowsByKey.set(key, row);
    }

    return row;
  }

  _getCell(node, prop, index) {
    const row = this._getRow(node);
    const description = prop.propDescription(index);
    let cell = row.cells.get(description);

    if (!cell) {
      cell = {
        description,
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
      this.cells.push(cell);
      row.cells.set(description, cell);
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

  // The values that the nodes of a row give a cell that their own places
  // don't set, as the graph gives them: `value` from any write, `writtenValue`
  // from a patch or relate. A `#ref{}` is `UNRESOLVED` until it's resolved.
  _getGivenValues(cell) {
    if (!cell.givenValues) {
      const { row, prop, index, setNodes } = cell;
      const { actions, graphOptions } = this.plan;
      const givenValues = {};

      for (const node of row.nodes) {
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

          if (
            givenValues.writtenValue === undefined &&
            action !== 'insert' &&
            value !== undefined
          ) {
            givenValues.writtenValue = value;
            givenValues.writingNode = node;
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

  // Return true if a cell of `node` holds a `#ref{}` that isn't resolved yet:
  _hasReference(node, prop, index) {
    return (
      !this.resolvedNodes.has(node) &&
      node.propertyReferences.some(({ path }) => path[0] === prop.props[index])
    );
  }

  // The value of an anchor cell: of a row that the graph inserts once it's
  // inserted, with `null` for the cells the graph doesn't give, a value that
  // a patch or relate writes, which wins over the inserted one, an id, or the
  // current value.
  _getAnchorValue(cell) {
    const { row, prop, index } = cell;
    const { nodes } = row;
    const [node] = nodes;
    const getValue = (obj) => (obj ? prop.getProp(obj, index) : undefined);
    const { writtenValue } = this._getGivenValues(cell);

    if (row.isInsert) {
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
      (cell.row.isInsert && !cell.row.isInserted) ||
      this._getGivenValues(cell).writtenValue === UNRESOLVED
    );
  }

  // The value of an anchor cell that is known before the writes, as a key to
  // compare: the given value, or for the id of a new row the row itself, which
  // differs from all other values.
  _getKnownKey(cell) {
    const { row, prop, index } = cell;

    if (row.isInsert) {
      const { value } = this._getGivenValues(cell);
      return value === UNRESOLVED
        ? undefined
        : value !== undefined
          ? `=${value}`
          : cell.isId
            ? row.key
            : undefined;
    } else {
      const value = this._isWaiting(cell) ? undefined : this._getAnchorValue(cell);
      return value !== undefined ? `=${value}` : undefined;
    }
  }

  // The value of the slot of `cell`, from its anchors, which agree, or without
  // any, from the current values of the cells its places read. `undefined`
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

  // The current value of `cell`, `null` once it's cleared:
  _getCurrentValue(cell) {
    return this._isCleared(cell) ? null : this._getStoredValue(cell);
  }

  // The value of `cell` in its row before any clears: of its
  // current row, or what an ignored node gives it, as the graph doesn't write
  // it there:
  _getStoredValue(cell) {
    const { row, prop, index } = cell;

    for (const node of row.nodes) {
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

  // Return true if another node than the ones that read `cell` clears it:
  _isCleared(cell) {
    const clearingNodes = cell.row.clearingNodes.get(cell.description);
    return (cell.isCleared ??=
      !!clearingNodes && [...clearingNodes].some((node) => !cell.readerNodes.has(node)));
  }

  // Throw for slots whose anchors, or whose rows without any, give different
  // values that are known before the writes.
  _checkSlots() {
    const slots = new Set(this.cells.map((cell) => cell.slot));

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
// inserted (Vincit#1378). The cell then keeps that value for all its readers.
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
