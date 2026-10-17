// Type tests for the column checks of strict mode: column names are checked
// against the model of the query, and qualified with relation paths, against
// the related models.

import { Model, QueryBuilder, raw, ref } from 'objection';
import { Animal, CustomPerson, Person } from './models.js';

async function rootColumns() {
  // Columns of the model: its properties without methods and relations.
  await Person.query().where('firstName', 'Jennifer');
  await Person.query().where('lastName', 'Lawrence');
  // @ts-expect-error typo
  await Person.query().where('firstNme', 'Jennifer');
  // @ts-expect-error relations aren't columns
  await Person.query().where('pets', 1);
  // @ts-expect-error methods aren't columns
  await Person.query().where('fullName', 1);
  // @ts-expect-error neither are model members
  await Person.query().where('$modelClass', 1);

  // Qualifiers that aren't relations, like table names and aliases, aren't
  // checked, nor are their columns.
  await Person.query().where('persons.firstName', 'Jennifer');
  await Person.query().alias('p').where('p.firstName', 'Jennifer');
  await Person.query().join('animals', 'persons.id', 'animals.ownerId').where('animals.x', 1);
}

// Properties starting with `$` are internal, like in `toJSON()`, not columns.
class AppModel extends Model {
  $app!: object;
}

class Item extends AppModel {
  id!: number;
}

async function internalProperties() {
  await Item.query().where('id', 1);
  // @ts-expect-error
  await Item.query().where('$app', 1);
  // A base model with only internal properties has no columns to check.
  await AppModel.query().where('anything', 1);
}

async function relationColumns() {
  // Columns qualified with a relation path are checked against the related
  // model, in any order: the relations are joined by joinRelated() or
  // withGraphJoined(), before or after.
  await Person.query().joinRelated('pets').where('pets.name', 'Fluffy');
  await Person.query().where('pets.name', 'Fluffy').joinRelated('pets');
  await Person.query()
    .withGraphJoined('pets.owner')
    .where('pets:owner.firstName', 'Jennifer')
    .orderBy('pets:owner.age');
  await Person.query().where('parent:parent:pets.name', 'x');
  // @ts-expect-error typo in the column of a relation
  await Person.query().joinRelated('pets').where('pets.nme', 'Fluffy');
  // @ts-expect-error not a column of the related model
  await Person.query().joinRelated('pets').where('pets.age', 1);
  // @ts-expect-error typo deeper in the path
  await Person.query().where('pets:owner.firstNme', 'Jennifer');
  // A path that isn't one of relations is a qualifier, e.g. an alias.
  await Person.query().joinRelated('pets as p').where('p.name', 'Fluffy');
}

async function methods() {
  const q = Person.query();

  await q.orWhere('age', '>', 10).andWhereNot('firstName', 'Jennifer');
  await q.whereIn('id', [1, 2]).orWhereNotIn('firstName', ['a', 'b']);
  await q.whereIn('id', Animal.query().select('ownerId'));
  await q.whereIn(['id', 'age'], [[1, 2]]);
  await q.whereBetween('age', [10, 20]);
  await q.whereNull('age').orWhereNotNull('lastName');
  await q.whereColumn('firstName', 'lastName').orWhereColumn('id', '>', 'age');
  await q.whereColumn('pets.ownerId', ref('persons.id'));
  await q.whereLike('firstName', 'Jen%').orWhereILike('lastName', '%ce');
  await q.whereComposite(['id', 'age'], '=', [1, 2]);
  await q.whereInComposite(['id', 'age'], [[1, 2]]);
  await q.whereJsonSupersetOf('address:street', { name: 'x' });
  await q.whereJsonIsArray('tags').whereJsonHasAny('address', 'street');
  await q.increment('age', 1).decrement('age');
  await q.orderBy('firstName').orderBy('persons.age', 'desc', 'last');
  await q.orderBy(['firstName', { column: 'age', order: 'desc' }]);
  await q.groupBy('firstName', 'lastName').groupBy(['age']);
  await q.having('age', '>', 1).havingIn('age', [1]).havingNull('age');
  await q.jsonExtract('address', '$.street', 'street');

  // @ts-expect-error
  await q.whereIn('ids', [1, 2]);
  // @ts-expect-error
  await q.whereIn(['id', 'agee'], [[1, 2]]);
  // @ts-expect-error
  await q.whereBetween('ages', [10, 20]);
  // @ts-expect-error
  await q.whereNull('agee');
  // @ts-expect-error
  await q.whereColumn('firstName', 'lastNme');
  // @ts-expect-error
  await q.whereLike('firstNme', 'Jen%');
  // @ts-expect-error
  await q.whereComposite(['id', 'agee'], '=', [1, 2]);
  // @ts-expect-error
  await q.whereJsonSupersetOf('adress:street', { name: 'x' });
  // @ts-expect-error
  await q.increment('agee', 1);
  // @ts-expect-error
  await q.orderBy('firstNme');
  // @ts-expect-error
  await q.orderBy([{ column: 'agee' }]);
  // @ts-expect-error
  await q.groupBy('firstName', 'lastNme');
  // @ts-expect-error
  await q.having('agee', '>', 1);
  // @ts-expect-error
  await q.jsonExtract('adress', '$.street');

  // Objects are checked too.
  await q.where({ firstName: 'Jennifer', 'pets.name': 'Fluffy' });
  // @ts-expect-error
  await q.where({ firstNme: 'Jennifer' });
  // Also when they aren't literals, next to valid columns:
  const unknownKey = { firstName: 'Jennifer', bogus: 1 };
  // @ts-expect-error
  await q.where(unknownKey);
  // @ts-expect-error
  await Person.query().findOne(unknownKey);
  // @ts-expect-error
  await q.having(unknownKey);
  const typo = { age: 1, agee: 2 };
  // @ts-expect-error
  await q.where(typo);
  const relationColumn = { firstName: 'Jennifer', 'pets.bogus': 1 };
  // @ts-expect-error
  await q.where(relationColumn);
  const record: Record<string, unknown> = {};
  // @ts-expect-error
  await q.where(record);

  // `findOne()` takes the same arguments as `where()`.
  await Person.query().findOne('firstName', 'Jennifer');
  await Person.query().findOne({ firstName: 'Jennifer' });
  // @ts-expect-error
  await Person.query().findOne('firstNme', 'Jennifer');

  // Callbacks get the query builder of the model.
  await Person.query().where((qb) => qb.where('pets.name', 'Fluffy').orWhere('firstName', 'x'));
  await Person.query().where((qb) => {
    // @ts-expect-error
    qb.where('firstNme', 'Jennifer');
  });
}

async function selections() {
  await Person.query().select('id', 'persons.firstName', 'persons.*', 'pets.*', '*');
  await Person.query().select(['id', 'firstName']);
  await Person.query().select('firstName as name', raw('1'), ref('age'), 1);
  await Person.query().columns({ name: 'firstName' }).distinct('lastName');
  await Person.query().select(Animal.query().count().as('petCount'));
  // @ts-expect-error
  await Person.query().select('id', 'firstNme');
  // @ts-expect-error
  await Person.query().select('firstNme as name');
  // @ts-expect-error
  await Person.query().select({ name: 'firstNme' });

  // Aggregates check their columns.
  await Person.query().count().count('*').count('id', 'age').countDistinct('age');
  await Person.query().count('id as n').count({ n: 'id' });
  await Person.query().min('age').max('persons.age').avg('age').sumDistinct('age');
  // @ts-expect-error
  await Person.query().count('agee');
  // @ts-expect-error
  await Person.query().min('agee');
}

async function unchecked(column: string, personColumn: 'firstName' | 'lastName') {
  // Raw and ref() are always accepted, e.g. for columns of other queries.
  await Animal.query().whereColumn('animals.ownerId', ref('persons.id'));
  await Person.query().where(ref('anything'), 1).where(raw('anything = 1'));
  await Person.query().orderBy(raw('anything')).groupBy(ref('anything'));

  // Unions of literals are checked, plain strings need ref().
  await Person.query().where(personColumn, 'Jennifer').orderBy(personColumn);
  // @ts-expect-error use ref() for dynamic columns
  await Person.query().orderBy(column);
  await Person.query().orderBy(ref(column));

  // Query builders for `any` models and for models without declared
  // columns aren't checked.
  const anyQuery: QueryBuilder<any> = Person.query();
  await anyQuery.where('anything', 1);
  await Model.query().where('anything', 1);
  class Untyped extends Model {
    static tableName = 'untyped';
  }
  await Untyped.query().where('anything', 1).orderBy('anything');
}

// Pin what wrappers that forward their arguments through `Parameters<>` get:
// the last overload, which takes where objects without checking their keys.
// The literal column checks of `select()` and `whereIn()` can't be forwarded:
// `Parameters<>` of `select()` is `unknown[]`, so such a wrapper accepts any
// arguments, and fails to compile inside its body.

function where(...args: Parameters<QueryBuilder<Person>['where']>) {
  return Person.query().where(...args);
}

function findOne(...args: Parameters<QueryBuilder<Person>['findOne']>) {
  return Person.query().findOne(...args);
}

async function forwarded() {
  await where({ firstName: 'Jennifer', unknown: 1 });
  await findOne({ firstName: 'Jennifer', unknown: 1 });
}

// Generic code is checked loosely, as the columns can't be resolved there.

export class GenericQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<
  M,
  R,
  X
> {
  declare RebindType: GenericQueryBuilder<this['~M'], this['~R'], this['~X']>;

  byName(name: string) {
    return this.where('name', name).orderBy('name').findById(1).where('name', name);
  }
}

export class PersonWithMethods extends Model {
  static tableName = 'persons';
  id!: number;
  pets?: Animal[];

  petsByName(name: string) {
    return this.$relatedQuery('pets').where('name', name);
  }

  reload() {
    return this.$query().where('id', this.id);
  }

  // After withGraphFetched() on a generic query builder, TypeScript resolves
  // the narrowed query builder to a union, on which only raw and ref() columns
  // are accepted.
  withPets() {
    return this.$query().withGraphFetched('pets').where(ref('id'), this.id);
  }

  withPetsByColumn() {
    // @ts-expect-error
    return this.$query().withGraphFetched('pets').where('id', this.id);
  }
}

function generic<M extends Model>(query: QueryBuilder<M>) {
  return query.where('anything', 1).whereIn('anything', [1]).orderBy('anything');
}

function genericPersons<QB extends QueryBuilder<Person>>(query: QB) {
  return query.withGraphFetched('pets').where(ref('anything'), 1);
}

async function customQueryBuilders() {
  await CustomPerson.query().where('firstName', 'Jennifer').someCustomMethod();
  await CustomPerson.query().someCustomMethod().where('firstName', 'Jennifer');
  await CustomPerson.query().first().someCustomMethod().where('pets.name', 'x');
  // @ts-expect-error
  await CustomPerson.query().someCustomMethod().where('firstNme', 'Jennifer');
  // Custom query builders remain assignable to QueryBuilder.
  const qb: QueryBuilder<CustomPerson> = CustomPerson.query();
}
