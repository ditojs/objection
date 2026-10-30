'use strict';

const { getModel } = require('../../../model/getModel');
const { GraphAction } = require('../GraphAction');
const { isInternalProp } = require('../../../utils/internalPropUtils');
const { getQueryPropKeys, isQueryProp } = require('../../../model/modelQueryProps');
const { difference, isObject, isPlainObject, jsonEquals } = require('../../../utils/objectUtils');
const promiseUtils = require('../../../utils/promiseUtils');

class GraphPatchAction extends GraphAction {
  constructor(graphData, { nodes }) {
    super(graphData);
    // Nodes to patch.
    this.nodes = nodes;
  }

  run(builder) {
    return promiseUtils.map(this.nodes, (node) => this._runForNode(builder, node), {
      concurrency: this._getConcurrency(builder, this.nodes),
    });
  }

  _runForNode(builder, node) {
    const shouldPatch = this.graphOptions.shouldPatch(node, this.graphData);
    const shouldUpdate = this.graphOptions.shouldUpdate(node, this.graphData);

    // BelongsToOneRelation inserts and relates change the parent object's
    // properties. That's why we handle them here.
    const changedPropsBecauseOfBelongsToOneInsert = this._handleBelongsToOneInserts(node);

    // BelongsToOneRelation deletes and unrelates change the parent object's
    // properties. That's why we handle them here.
    const changePropsBecauseOfBelongsToOneDelete = this._handleBelongsToOneDeletes(node);

    // HasManyRelation and HasOneRelation relates write the related object's
    // foreign keys, also with `noUpdate`.
    const changedPropsBecauseOfRelate =
      this.graphOptions.shouldRelate(node, this.graphData) &&
      node.parentEdge.relation.isObjectionHasManyRelation
        ? node.parentEdge.relation.relatedProp.props
        : [];

    const handleUpdate = () => {
      const { changedProps, unchangedProps } = this._findChanges(node);
      const allProps = [...changedProps, ...unchangedProps];

      const propsToUpdate = difference(
        shouldPatch || shouldUpdate
          ? changedProps
          : [
              ...changedPropsBecauseOfBelongsToOneInsert,
              ...changePropsBecauseOfBelongsToOneDelete,
              ...changedPropsBecauseOfRelate,
            ],

        // Remove id properties from the props to update. With upsertGraph
        // it never makes sense to change the id.
        node.modelClass.getIdPropertyArray(),
      );

      const update = propsToUpdate.length > 0;
      if (update) {
        // Don't update the fields that we know not to change.
        node.obj.$omitFromDatabaseJson(difference(allProps, propsToUpdate));
        node.userData.updated = true;
      }

      return update;
    };

    const Model = getModel();
    // See if the model defines a beforeUpdate or $beforeUpdate hook. If it does
    // not, we can check for updated properties now and drop out immediately if
    // there is nothing to update. Otherwise, we need to wait for the hook to be
    // called before calling handleUpdate, but only if the node contains changes
    // that aren't id properties (relates). See issues #2233, #2605.
    const hasBeforeUpdate =
      node.obj.constructor.beforeUpdate !== Model.beforeUpdate ||
      node.obj.$beforeUpdate !== Model.prototype.$beforeUpdate;

    if (
      (hasBeforeUpdate && !this._hasNonIdPropertyChanges(node)) ||
      (!hasBeforeUpdate && !handleUpdate())
    ) {
      return null;
    }

    delete node.obj[node.modelClass.uidProp];
    delete node.obj[node.modelClass.uidRefProp];
    delete node.obj[node.modelClass.dbRefProp];
    delete node.obj[node.modelClass.graphUnrelateProp];
    delete node.obj[node.modelClass.graphDeleteProp];

    node.obj.$validate(null, {
      dataPath: node.dataPathKey,
      patch: shouldPatch || (!shouldPatch && !shouldUpdate),
    });

    const updateBuilder = this._createBuilder(node)
      .childQueryOf(builder, childQueryOptions())
      // The current graph was fetched through the relations, so the patched
      // models are known to be related to their parents.
      .internalOptions({ skipRelationFilter: true })
      .copyFrom(builder, GraphAction.ReturningAllSelector);

    if (hasBeforeUpdate) {
      updateBuilder.internalContext().runBefore.push((result, builder) => {
        // Call handleUpdate in the runBefore hook which runs after the
        // $beforeUpdate hook, allowing it to modify the object before the
        // updated properties are determined. See issue #2233.
        if (hasBeforeUpdate && !handleUpdate()) {
          builder.internalOptions().returnImmediatelyValue = null;
        }
        return result;
      });
    }

    if (shouldPatch) {
      updateBuilder.patch(node.obj);
    } else {
      updateBuilder.update(node.obj);
    }

    return updateBuilder.execute().then((result) => {
      if (isObject(result) && result.$isObjectionModel) {
        // Handle returning('*').
        node.obj.$set(result);
      }

      return result;
    });
  }

  _handleBelongsToOneInserts(node) {
    const currentNode = this.currentGraph.nodeForNode(node);
    const updatedProps = [];

    for (const edge of node.edges) {
      if (
        edge.isOwnerNode(node) &&
        edge.relation &&
        edge.relation.isObjectionBelongsToOneRelation &&
        edge.relation.relatedProp.hasProps(edge.relatedNode.obj) &&
        // Ignored models don't replace the current one, and models marked with
        // `#unrelate` or `#delete` are handled below.
        !this.graphOptions.shouldIgnore(edge.relatedNode, this.graphData)
      ) {
        const { relation } = edge;

        relation.ownerProp.forEach((i) => {
          const currentValue = currentNode && relation.ownerProp.getProp(currentNode.obj, i);
          const relatedValue = relation.relatedProp.getProp(edge.relatedNode.obj, i);

          if (currentValue != relatedValue) {
            relation.ownerProp.setProp(node.obj, i, relatedValue);
            updatedProps.push(relation.ownerProp.props[i]);
          }
        });
      }
    }

    return updatedProps;
  }

  _handleBelongsToOneDeletes(node) {
    const currentNode = this.currentGraph.nodeForNode(node);
    const updatedProps = [];

    if (!currentNode) {
      return updatedProps;
    }

    for (const edge of currentNode.edges) {
      if (
        edge.isOwnerNode(currentNode) &&
        edge.relation.isObjectionBelongsToOneRelation &&
        (node.obj[edge.relation.name] === null ||
          isToBeUnrelatedOrDeleted(this.graph.nodeForNode(edge.relatedNode))) &&
        this.graphOptions.shouldDeleteOrUnrelate(edge.relatedNode, this.graphData)
      ) {
        const { relation } = edge;

        relation.ownerProp.forEach((i) => {
          const currentValue = relation.ownerProp.getProp(currentNode.obj, i);

          if (currentValue != null) {
            relation.ownerProp.setProp(node.obj, i, null);
            updatedProps.push(relation.ownerProp.props[i]);
          }
        });
      }
    }

    return updatedProps;
  }

  _findChanges(node) {
    const obj = node.obj;
    const currentNode = this.currentGraph.nodeForNode(node);
    const currentObj = (currentNode && currentNode.obj) || {};
    const relationNames = node.modelClass.getRelationNames();
    const relation = node.parentEdge && node.parentEdge.relation;
    const extraProps =
      relation && relation.joinTableExtras
        ? relation.joinTableExtras.map((extra) => extra.aliasProp)
        : [];

    const unchangedProps = [];
    const changedProps = [];
    // The props that the current object doesn't have:
    const unknownProps = [];

    for (const prop of Object.keys(obj)) {
      if (isInternalProp(prop) || relationNames.includes(prop)) {
        continue;
      }

      const value = obj[prop];
      const currentValue = currentObj[prop];

      if (currentValue === undefined) {
        // Join table extras and query properties are written in any case.
        if (extraProps.includes(prop) || isQueryProp(value)) {
          changedProps.push(prop);
        } else {
          unknownProps.push(prop);
        }
      } else if (nonStrictEquals(currentValue, value)) {
        // We test non-strict equality on purpose. See issue #732.
        unchangedProps.push(prop);
      } else {
        changedProps.push(prop);
      }
    }

    // If the current object doesn't have the property, we have to assume it
    // changes (we cannot know if it will), unless it isn't written at all, like
    // the properties that `$toDatabaseJson()` leaves out, which the current
    // graph wasn't fetched with either.
    if (unknownProps.length > 0) {
      if (isWritten(obj, unknownProps)) {
        changedProps.push(...unknownProps);
      } else {
        unchangedProps.push(...unknownProps);
      }
    }

    // We cannot know if the query properties cause changes to the values.
    // We must assume that they do.
    if (obj.$$queryProps) {
      changedProps.push(...Object.keys(obj.$$queryProps));
    }

    return {
      changedProps,
      unchangedProps,
    };
  }

  _hasNonIdPropertyChanges(node) {
    const idProps = node.modelClass.getIdPropertyArray();
    return this._findChanges(node).changedProps.some((prop) => !idProps.includes(prop));
  }

  _createBuilder(node) {
    if (node.parentEdge && !node.parentEdge.relation.isObjectionHasManyRelation) {
      return this._createRelatedBuilder(node);
    } else {
      return this._createRootBuilder(node);
    }
  }

  _createRelatedBuilder(node) {
    return node.parentNode.obj
      .$relatedQuery(node.parentEdge.relation.name)
      .findById(node.obj.$id());
  }

  _createRootBuilder(node) {
    const currentNode = this.currentGraph.nodeForNode(node);
    const currentObj = currentNode && currentNode.obj;

    return currentObj ? currentObj.$query() : node.obj.$query();
  }
}

function childQueryOptions() {
  return {
    fork: true,
    isInternalQuery: true,
  };
}

// Returns whether `props` of `obj` are written to the database, by leaving them
// out of its database JSON, as `$formatDatabaseJson()` may drop, rename or
// combine properties. Query properties are always written, and left out of
// both.
function isWritten(obj, props) {
  const hasOmitted = obj.hasOwnProperty('$$omitFromDatabaseJson');
  const omittedProps = obj.$$omitFromDatabaseJson;

  try {
    obj.$omitFromDatabaseJson([
      ...getQueryPropKeys(obj),
      ...Object.keys(obj).filter((prop) => isQueryProp(obj[prop])),
    ]);
    const json = obj.$toDatabaseJson();
    obj.$omitFromDatabaseJson(props);
    return !jsonEquals(json, obj.$toDatabaseJson());
  } finally {
    if (hasOmitted) {
      obj.$$omitFromDatabaseJson = omittedProps;
    } else {
      delete obj.$$omitFromDatabaseJson;
    }
  }
}

function nonStrictEquals(val1, val2) {
  // Only use loose equality for non-JSON values, so that for example `false`
  // and `[]` are not considered equal. See issue #1874.
  if (!isJsonValue(val1) && !isJsonValue(val2) && val1 == val2) {
    return true;
  }

  return jsonEquals(val1, val2);
}

function isJsonValue(value) {
  return Array.isArray(value) || isPlainObject(value);
}

function isToBeUnrelatedOrDeleted(node) {
  return !!node && node.toBeUnrelatedOrDeleted;
}

module.exports = {
  GraphPatchAction,
};
