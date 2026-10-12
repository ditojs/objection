import { Relation } from '../Relation.js';
import { BelongsToManyFindOperation } from './BelongsToManyFindOperation.js';
import { BelongsToManyInsertOperation } from './BelongsToManyInsertOperation.js';
import { BelongsToManyDeleteOperation } from './BelongsToManyDeleteOperation.js';
import { BelongsToManyRelateOperation } from './BelongsToManyRelateOperation.js';
import { BelongsToManyUnrelateOperation } from './BelongsToManyUnrelateOperation.js';

import { raw } from '../../queryBuilder/RawBuilder.js';
import { ref } from '../../queryBuilder/ReferenceBuilder.js';
import { addWhereGroup } from '../../queryBuilder/whereGroups.js';
import { isOwnerModelClassQuery } from '../RelationOwner.js';
import { valuesKey } from '../../model/modelValues.js';
import { isPostgres, isMySql, isSqlite, isMsSql } from '../../utils/knexUtils.js';
import { jsonEquals } from '../../utils/objectUtils.js';
import * as promiseUtils from '../../utils/promiseUtils/index.js';

// The aliases of the owner rows in `findQuery()` when the owners are given as
// ids or as a query, and of the keys in `isKeyIn()` on MySQL:
const ownersAlias = 'objectiontmpowners';
const keysAlias = 'objectiontmpkeys';

export class BelongsToManyRelation extends Relation {
  setMapping(mapping) {
    const retVal = super.setMapping(mapping);

    if (this.ownerProp.size !== 1) {
      throw this.createError('composite keys are not supported.');
    }

    return retVal;
  }

  // The keys of the related models that `owner` holds in its array:
  getKeys(owner) {
    const keys = this.ownerProp.getProp(owner, 0);

    if (keys == null) {
      return [];
    } else if (Array.isArray(keys)) {
      return keys.filter((key) => key != null);
    } else {
      throw this.createError(
        `the join property "${this.ownerProp.propDescription(0)}" must hold an array of keys, ` +
          `not ${JSON.stringify(keys)}. Add it to the jsonAttributes of ${this.ownerModelClass.name} ` +
          'if it holds a JSON array.',
      );
    }
  }

  // Remove the duplicate keys, keeping the first of each:
  normalizeKeys(keys) {
    const seen = new Set();

    return keys.filter((key) => {
      const id = valuesKey([key]);
      const isNew = !seen.has(id);
      seen.add(id);
      return isNew;
    });
  }

  // Remove the keys in `remove` from `keys` and add the ones in `add`, leaving
  // out empty keys. Keys that are already there keep their place and value:
  changeKeys(keys, { add = [], remove = [] }) {
    const removedKeys = new Set(remove.map((key) => valuesKey([key])));

    return this.normalizeKeys([
      ...keys.filter((key) => !removedKeys.has(valuesKey([key]))),
      ...add.filter((key) => key != null),
    ]);
  }

  // Create the patch that writes `keys` to the array of the `owner` row: only
  // the array inside a JSON column, unless the column is empty.
  createKeysPatch(owner, keys) {
    const patch = {};

    if (owner[this.ownerProp.props[0]] == null) {
      this.ownerProp.setProp(patch, 0, keys);
    } else {
      this.ownerProp.patch(patch, 0, keys);
    }

    return patch;
  }

  findQuery(builder, owner) {
    const relatedRef = this.relatedProp.ref(builder, 0);

    addWhereGroup(builder, () => {
      if (owner.isReference) {
        builder.where(containsKey(builder, owner.reference[0], relatedRef));
      } else if (owner.isModels) {
        const keys = this.normalizeKeys(owner.modelArray.flatMap((model) => this.getKeys(model)));
        // Empty arrays are normal here, so we don't resolve the query early,
        // to keep the result of updates, deletes and aggregates.
        builder.where(keys.length ? isKeyIn(builder, relatedRef, keys) : false);
      } else if (owner.isIdentifiers || owner.isQueryBuilder) {
        // Look for the related rows in the arrays of the owner rows. The owner
        // query becomes a derived table, so that its `limit()` keeps applying
        // to the owners. The arrays are selected under the name of the owner
        // column, also for JSON field expressions.
        const owners = owner.getProps(this);
        const keysColumn = this.ownerProp.cols[0];

        if (isOwnerModelClassQuery(owners, this)) {
          owners.clearSelect().select(this.ownerProp.ref(owners, 0).as(keysColumn));
        }

        builder.whereExists(
          this.ownerModelClass
            .query()
            .childQueryOf(builder)
            .select(1)
            .from(owners.as(ownersAlias))
            .where(containsKey(builder, ref(`${ownersAlias}.${keysColumn}`), relatedRef)),
        );
      } else {
        builder.where(false).resolve([]);
      }
    });

    return this.applyModify(builder);
  }

  // @override
  joinOn(builder, join, { relatedTableAlias, ownerTable }) {
    const relatedRef = this.relatedProp.ref(builder, 0).table(relatedTableAlias);
    const keysRef = this.ownerProp.ref(builder, 0).table(ownerTable);

    join.on(containsKey(builder, keysRef, relatedRef));
  }

  find(_, owner) {
    return new BelongsToManyFindOperation('find', {
      relation: this,
      owner,
    });
  }

  insert(_, owner) {
    return new BelongsToManyInsertOperation('insert', {
      relation: this,
      owner,
    });
  }

  delete(_, owner) {
    return new BelongsToManyDeleteOperation('delete', {
      relation: this,
      owner,
    });
  }

  relate(_, owner) {
    return new BelongsToManyRelateOperation('relate', {
      relation: this,
      owner,
    });
  }

  unrelate(_, owner) {
    return new BelongsToManyUnrelateOperation('unrelate', {
      relation: this,
      owner,
    });
  }

  // Find the keys of the related rows that `builder` filters, for `unrelate()`
  // and `delete()`:
  findKeys(builder, owner) {
    const query = this.relatedModelClass.query().childQueryOf(builder);

    return query
      .copyFrom(builder, builder.constructor.JoinSelector)
      .copyFrom(builder, builder.constructor.WhereSelector)
      .modify((query) => this.findQuery(query, owner))
      .select(this.relatedProp.ref(query, 0))
      .runAfter((related) => related.map((rel) => this.relatedProp.getProp(rel, 0)));
  }

  // Add and remove keys in the arrays of the owner rows, and in the owner
  // models. Resolves to the number of owner rows that changed. The arrays are
  // read and written back by separate queries.
  updateKeys(builder, owner, { add = [], remove = [] }) {
    const { ownerModelClass, ownerProp } = this;
    const idProp = ownerModelClass.getIdRelationProperty();
    const ownerIds = owner.getProps(this, idProp);
    const query = ownerModelClass.query().childQueryOf(builder);
    const idRefs = idProp.refs(query);

    const updateRow = async (row) => {
      const keys = this.getKeys(row);
      const newKeys = this.changeKeys(keys, { add, remove });
      const isChanged = !jsonEquals(keys, newKeys);

      if (isChanged) {
        const patch = this.createKeysPatch(row, newKeys);

        await ownerModelClass.query().childQueryOf(builder).patch(patch).findById(row.$id());
      }

      if (owner.isModels) {
        const id = row.$idKey();

        for (const model of owner.modelArray) {
          if (model.$hasId() && model.$idKey() === id) {
            ownerProp.setProp(model, 0, newKeys);
          }
        }
      }

      return isChanged;
    };

    // Select the whole column of the arrays, also for JSON field expressions:
    return query
      .select([...idRefs, `${query.tableRefFor(ownerModelClass)}.${ownerProp.cols[0]}`])
      .modify((query) => {
        if (ownerIds) {
          query.whereInComposite(idRefs, ownerIds);
        } else {
          query.resolve([]);
        }
      })
      .runAfter(async (rows) => {
        const results = await promiseUtils.map(rows, updateRow, {
          concurrency: ownerModelClass.getConcurrency(builder.unsafeKnex()),
        });

        return results.filter(Boolean).length;
      });
  }
}

Object.defineProperties(BelongsToManyRelation.prototype, {
  isObjectionBelongsToManyRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

// The condition for the array of keys in `keysRef` to contain the key in
// `keyRef`. Postgres converts both to jsonb, which supports json, jsonb and
// native array columns alike.
function containsKey(builder, keysRef, keyRef) {
  const knex = builder.knex();

  if (isPostgres(knex)) {
    return raw('to_jsonb(?) @> to_jsonb(?)', [keysRef, keyRef]);
  } else if (isMySql(knex)) {
    return raw('? member of (?)', [keyRef, keysRef]);
  } else if (isSqlite(knex)) {
    return raw('exists (select 1 from json_each(?) where value = ?)', [keysRef, keyRef]);
  } else if (isMsSql(knex)) {
    return raw('exists (select 1 from openjson(?) where value = ?)', [keysRef, keyRef]);
  } else {
    throw new Error(`Unsupported database for BelongsToManyRelation: '${knex.client.dialect}'.`);
  }
}

// The condition for the key in `keyRef` to be one of `keys`. The keys are passed
// as one parameter, as an eager batch of owners can hold more keys than the
// database takes parameters.
function isKeyIn(builder, keyRef, keys) {
  const knex = builder.knex();
  const json = JSON.stringify(keys);

  if (isPostgres(knex)) {
    return raw('? = any(?)', [keyRef, keys]);
  } else if (isMySql(knex)) {
    return raw(
      `? in (select value from json_table(?, '$[*]' columns (value json path '$')) as ${keysAlias})`,
      [keyRef, json],
    );
  } else if (isSqlite(knex)) {
    return raw('? in (select value from json_each(?))', [keyRef, json]);
  } else if (isMsSql(knex)) {
    return raw('? in (select value from openjson(?))', [keyRef, json]);
  } else {
    throw new Error(`Unsupported database for BelongsToManyRelation: '${knex.client.dialect}'.`);
  }
}
