// Type tests for the ids of `findById()` and the other `*ById()` methods in
// strict mode: they take the types of the properties of a literal `idColumn`.

import {
  ConstructorType,
  Generated,
  MaybeCompositeId,
  Model,
  QueryBuilder,
  QueryBuilderType,
  TransactionOrKnex,
} from 'objection';

class Country extends Model {
  static tableName = 'countries';
  static idColumn = 'code' as const;
  code!: string;
  name!: string;

  static relationMappings = () => ({
    cities: {
      relation: Model.HasManyRelation,
      modelClass: City,
      join: { from: 'countries.code', to: 'cities.countryCode' },
    },
  });

  cities?: City[];
}

class City extends Model {
  static tableName = 'cities';
  static get idColumn() {
    return 'id' as const;
  }

  id!: Generated<number>;
  countryCode!: string;
  name!: string;
}

class Membership extends Model {
  static tableName = 'memberships';
  static idColumn = ['groupId', 'memberId'] as const;
  groupId!: number;
  memberId!: string;
}

// The id column is the database column, named after the property by the
// column name mapping.
class Account extends Model {
  static tableName = 'accounts';
  static idColumn = 'account_id' as const;
  declare ColumnNameMapping: 'snakeCase';
  accountId!: number;
}

// Models with the inherited `idColumn` take any id.
class Plain extends Model {
  static tableName = 'plain';
  id!: number;
}

async function ids() {
  await Country.query().findById('ch');
  // @ts-expect-error
  await Country.query().findById(1);
  await City.query().findById(1);
  // @ts-expect-error
  await City.query().findById('1');
  await Membership.query().findById([1, 'a']);
  // @ts-expect-error
  await Membership.query().findById(1);
  // @ts-expect-error
  await Membership.query().findById(['a', 1]);
  await Account.query().findById(1);
  // @ts-expect-error
  await Account.query().findById('1');
  await Plain.query().findById('1');

  // All `*ById()` methods, also after methods that change the result kind:
  await Country.query().findByIds(['ch', 'de']);
  // @ts-expect-error
  await Country.query().findByIds([1]);
  await Country.query().patchById('ch', { name: 'Switzerland' });
  // @ts-expect-error
  await Country.query().patchById(1, { name: 'Switzerland' });
  await Country.query().patchAndFetchById('ch', { name: 'Switzerland' });
  await Country.query().updateById('ch', { code: 'ch', name: 'Switzerland' });
  await Country.query().updateAndFetchById('ch', { code: 'ch', name: 'Switzerland' });
  // @ts-expect-error
  await Country.query().deleteById(1);
  // @ts-expect-error
  await Country.query().withGraphFetched('cities').select('name').findById(1);

  // relatedQuery() takes the ids of the related class.
  await Country.relatedQuery('cities').for('ch').findById(1);
  // @ts-expect-error
  await Country.relatedQuery('cities').for('ch').findById('1');

  await Membership.query()
    .withGraphFetched('nothing' as string)
    .findById([1, 'a']);
  // @ts-expect-error
  await Membership.query().select('groupId').findById(1);

  // Queries started from instances and generic code take any id.
  const country = await Country.query().findById('ch').throwIfNotFound();
  await country.$relatedQuery('cities').findById('1');
}

function generic<M extends Model>(query: QueryBuilder<M>) {
  return query.findById(1);
}

// Overrides of `query()` that call the method of `Model` directly:
class Scoped extends Model {
  static query<M extends Model>(this: ConstructorType<M>, trx?: TransactionOrKnex) {
    return Model.query.call(this, trx) as QueryBuilderType<M>;
  }
}

// Generic classes take the ids of their constraint.
class Record extends Model {
  static idColumn = 'id' as const;
  id!: number;

  static byId<T extends typeof Record>(this: T, id: number) {
    return this.query().findById(id);
  }

  static byAnyId<T extends typeof Model>(this: T, id: MaybeCompositeId) {
    return this.query().findById(id);
  }
}

function genericClass<C extends typeof Country>(modelClass: C) {
  // @ts-expect-error
  modelClass.query().findById(1);
  return modelClass.query().findById('ch');
}

class CountryQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<M, R, X> {
  declare RebindType: CountryQueryBuilder<this['~M'], this['~R'], this['~X']>;

  byAnyId() {
    return this.findById(1).deleteById('x');
  }
}
