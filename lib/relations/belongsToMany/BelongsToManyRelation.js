import { Relation } from '../Relation.js';
import { BelongsToManyFindOperation } from './BelongsToManyFindOperation.js';

import { raw } from '../../queryBuilder/RawBuilder.js';
import { ref } from '../../queryBuilder/ReferenceBuilder.js';
import { addWhereGroup } from '../../queryBuilder/whereGroups.js';
import { isOwnerModelClassQuery } from '../RelationOwner.js';
import { valuesKey } from '../../model/modelValues.js';
import { isPostgres, isMySql, isSqlite, isMsSql } from '../../utils/knexUtils.js';

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

  insert() {
    throw this.createError('insert() is not supported yet.');
  }

  delete() {
    throw this.createError('delete() is not supported yet.');
  }

  relate() {
    throw this.createError('relate() is not supported yet.');
  }

  unrelate() {
    throw this.createError('unrelate() is not supported yet.');
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
