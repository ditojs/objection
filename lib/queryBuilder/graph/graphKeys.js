import { difference, get, jsonEquals, set } from '../../utils/objectUtils.js';

// Resolve the keys and `#ref{}` values of the models of a planned graph, from
// the models they depend on and from their rows.

// Copy the keys and `#ref{}` values that `node` waits for into its model.
export function resolveDependencies(schedule, node) {
  for (const dependency of schedule.dependencies.get(node) || []) {
    if (!schedule.deferredDependencies.has(dependency)) {
      if (dependency.relation) {
        resolveKeys(dependency.related);
      } else if (dependency.reference) {
        resolvePropertyReference(dependency.dependent, dependency.reference);
      }
    }
  }
}

// Copy the keys and `#ref{}` values that `node` waits for into its model,
// after those that the graph fills into the models that it reads them from,
// e.g. the new key of an owner whose BelongsToOne row is replaced. Rows that
// move first only wait for rows that exist, see `GraphSchedule#_waitsForInserts()`.
export function resolveFilledDependencies(schedule, node, visitedNodes = new Set()) {
  visitedNodes.add(node);

  for (const dependency of schedule.dependencies.get(node) || []) {
    const referencedNode = dependency.node.referencedNode || dependency.node;

    if (!visitedNodes.has(referencedNode) && schedule.readsFilledProps(dependency)) {
      resolveFilledDependencies(schedule, referencedNode, visitedNodes);
    }
  }

  resolveDependencies(schedule, node);
}

// Change the arrays of keys that `node` holds for the relations that the graph
// gives it: Remove the keys of the current related rows that it deletes or
// unrelates, and add the keys of the related models that it writes. Other
// keys stay, e.g. of rows that the relation's filter leaves out. Relations
// that the graph leaves out keep their arrays (#1202). Return the props that
// change.
export function setKeyArrays(plan, node) {
  const { actions, graphOptions } = plan;
  const { existing } = node;
  const props = [];

  for (const name of node.modelClass.getRelationNames()) {
    const relation = node.obj[name] !== undefined && node.modelClass.getRelation(name);

    if (relation && hasOwnerKeyArray(relation)) {
      const { ownerProp, relatedProp } = relation;
      const getKey = (related) => relatedProp.getProp(related.obj, 0);
      const keys = relation.getKeys(existing ? existing.obj : node.obj);
      const removed = (existing?.activeChildren || []).filter(
        (child) =>
          child.relation.name === name && ['delete', 'unrelate'].includes(actions.get(child)),
      );
      const added = node.activeChildren.filter(
        (child) =>
          child.relation.name === name &&
          !child.toBeUnrelatedOrDeleted &&
          actions.get(child) !== 'ignore',
      );

      for (const related of added) {
        resolveReference(related);
      }

      const newKeys = relation.changeKeys(keys, {
        add: added.map(getKey),
        remove: removed.map(getKey),
      });

      if (!existing || graphOptions.shouldUpdate(node)) {
        // Inserts and updates write the whole row:
        ownerProp.setProp(node.obj, 0, newKeys);
        props.push(ownerProp.props[0]);
      } else if (!jsonEquals(keys, newKeys)) {
        const patch = relation.createKeysPatch(existing.obj, newKeys);
        Object.assign(node.obj, patch);
        props.push(...Object.keys(patch));
      }
    }
  }

  return props;
}

// Point the keys of `node` to its BelongsToOne rows that are inserted or
// related, and return the props that change.
export function setKeysOfRelatedRows(plan, node) {
  const { actions } = plan;
  const props = [];

  for (const child of node.activeChildren) {
    const { relation } = child;

    if (
      hasOwnerKey(relation) &&
      relation.relatedProp.hasProps(child.obj) &&
      // Ignored models don't replace the current one, and models marked with
      // `#unrelate` or `#delete` are handled below.
      actions.get(child) !== 'ignore'
    ) {
      relation.ownerProp.forEach((i) => {
        const currentValue = node.existing && relation.ownerProp.getProp(node.existing.obj, i);
        const value = relation.relatedProp.getProp(child.obj, i);

        if (currentValue != value) {
          relation.ownerProp.setProp(node.obj, i, value);
          props.push(relation.ownerProp.props[i]);
        }
      });
    }
  }

  return props;
}

// Clear the keys of `node` that point to BelongsToOne rows that are removed,
// and return the props that change.
export function clearKeysOfRemovedRows(plan, node) {
  const { actions } = plan;
  const props = [];

  for (const currentChild of node.existing?.activeChildren || []) {
    const { relation } = currentChild;

    if (
      hasOwnerKey(relation) &&
      (node.obj[relation.name] === null || currentChild.node?.toBeUnrelatedOrDeleted) &&
      actions.get(currentChild) !== 'keep'
    ) {
      relation.ownerProp.forEach((i) => {
        if (relation.ownerProp.getProp(node.existing.obj, i) != null) {
          relation.ownerProp.setProp(node.obj, i, null);
          props.push(relation.ownerProp.props[i]);
        }
      });
    }
  }

  return props;
}

// Copy the keys of the relation of `node` to the side that stores them,
// whichever node was inserted first (#311).
export function resolveKeys(node) {
  const { relation, parent } = node;

  // The arrays of keys of owners are written by `setKeyArrays()`.
  if (relation.keySide === 'related' || hasOwnerKey(relation)) {
    const { ownerProp, relatedProp } = relation;
    const [source, sourceProp, target, targetProp] =
      relation.keySide === 'owner'
        ? [node, relatedProp, parent, ownerProp]
        : [parent, ownerProp, node, relatedProp];

    resolveReference(source);
    resolveReference(target);

    targetProp.forEach((i) => {
      targetProp.setProp(target.obj, i, sourceProp.getProp(source.obj, i));
    });
  }
}

// Give a `#ref` model the props of the model it refers to that it doesn't have,
// and the `filledProps` again, as they may have changed since. Its own keys
// stay its own, and the join table extras of the place of the model belong to
// the join row there.
export function resolveReference(node, filledProps = []) {
  const { referencedNode, relation } = node;

  if (referencedNode) {
    const ownKeys = relation?.keySide === 'related' ? relation.relatedProp.props : [];
    const modelExtras =
      referencedNode.relation?.keySide === 'join'
        ? referencedNode.relation.joinTableExtras.map((extra) => extra.aliasProp)
        : [];

    for (const prop of difference(Object.keys(referencedNode.obj), modelExtras)) {
      if (
        !Object.hasOwn(node.obj, prop) ||
        (filledProps.includes(prop) && !ownKeys.includes(prop))
      ) {
        node.obj[prop] = referencedNode.obj[prop];
      }
    }
  }
}

// Replace a `#ref{}` in a prop of `node` with the value it refers to. A whole
// value is replaced even if the relation set the prop already (Vincit#1378).
function resolvePropertyReference(node, { path, match, refPath, isWholeValue, referencedNode }) {
  const value = get(referencedNode.obj, refPath);
  set(node.obj, path, isWholeValue ? value : get(node.obj, path).replace(match, value));
}

// Fill in the keys of `node` that the graph leaves out from its row: the keys
// that its related models read from wherever the row was found, and the key
// of its parent relation only from its row in the same place. The keys that it
// holds for the BelongsToOne rows that the graph writes come from the graph.
export function copyKeysFromExisting(node, actions) {
  const { existing, current } = node;

  if (existing) {
    const copies = [
      ...(node.parent && current ? [[node.relation.relatedProp, current]] : []),
      ...node.activeChildren
        .filter(
          (child) =>
            !hasOwnerKeyArray(child.relation) &&
            (child.relation.keySide !== 'owner' || actions.get(child) === 'ignore'),
        )
        .map((child) => [child.relation.ownerProp, existing]),
    ];

    for (const [prop, source] of copies) {
      prop.forEach((i) => {
        if (prop.getProp(node.obj, i) === undefined) {
          prop.setProp(node.obj, i, prop.getProp(source.obj, i));
        }
      });
    }
  }
}

// Fetch the keys that the relations of the inserted nodes need, but that the
// database generated and the insert didn't return, like a uuid that isn't the
// id (Vincit#853).
export async function fetchGeneratedKeys(builder, modelClass, nodes) {
  const keyProps = (node) => [
    ...(node.relation && node.relation.keySide !== 'related' ? [node.relation.relatedProp] : []),
    ...node.activeChildren
      .filter((child) => child.relation.keySide !== 'owner')
      .map((child) => child.relation.ownerProp),
  ];
  const missingNodes = nodes.filter((node) =>
    keyProps(node).some((prop) => prop.getProps(node.obj).some((value) => value === undefined)),
  );

  if (missingNodes.length > 0 && missingNodes.every((node) => node.obj.$hasId())) {
    // SQL Server returns columns selected twice as arrays, so the ids are
    // part of the set:
    const columns = new Set([
      ...modelClass.getIdColumnArray(),
      ...missingNodes.flatMap((node) => keyProps(node)).flatMap((prop) => prop.cols),
    ]);
    const rows = await modelClass
      .query()
      .childQueryOf(builder, { fork: true, isInternalQuery: true })
      .findByIds(missingNodes.map((node) => node.obj.$id()))
      .select([...columns]);
    const rowsByKey = new Map(rows.map((row) => [row.$idKey(), row]));

    for (const node of missingNodes) {
      const row = rowsByKey.get(node.obj.$idKey());

      for (const prop of keyProps(node)) {
        prop.forEach((i) => {
          if (prop.getProp(node.obj, i) === undefined) {
            prop.setProp(node.obj, i, prop.getProp(row, i));
          }
        });
      }
    }
  }
}

export function hasOwnerKey(relation) {
  return relation.keySide === 'owner' && relation.isOneToOne();
}

function hasOwnerKeyArray(relation) {
  return relation.keySide === 'owner' && !relation.isOneToOne();
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
