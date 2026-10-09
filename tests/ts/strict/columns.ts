// Type tests for the column checks of strict mode: column arguments are
// checked against the columns in the scope of the query.

import './strict-mode';
import { Model, QueryBuilder, raw, ref } from 'objection';
import { Animal, CustomPerson, Person } from './models';

async function rootColumns() {
  // Columns of the root model: its non-function, non-relation properties.
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

  // Qualified with the literal `static tableName` of Person.
  await Person.query().where('persons.firstName', 'Jennifer');
  // @ts-expect-error not the table name
  await Person.query().where('people.firstName', 'Jennifer');
  // @ts-expect-error typo in a qualified column
  await Person.query().where('persons.firstNme', 'Jennifer');

  // Without a literal table name, any qualifier is accepted for the root
  // columns, but the column itself is still checked.
  await Animal.query().where('animals.name', 'Fluffy');
  await Animal.query().where('anything.name', 'Fluffy');
  // @ts-expect-error
  await Animal.query().where('animals.nme', 'Fluffy');

  // `alias()` adds a name for the root table.
  await Person.query().alias('p').where('p.firstName', 'Jennifer');
  await Person.query().alias('p').where('persons.firstName', 'Jennifer');
  // @ts-expect-error
  await Person.query().alias('p').where('q.firstName', 'Jennifer');
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
  await q.whereLike('firstName', 'Jen%').orWhereILike('lastName', '%ce');
  await q.whereComposite(['id', 'age'], '=', [1, 2]);
  await q.whereInComposite(['id', 'age'], [[1, 2]]);
  await q.whereJsonSupersetOf('address:street', { name: 'x' });
  await q.whereJsonIsArray('tags').whereJsonHasAny('address', 'street');
  await q.increment('age', 1).decrement('age');
  await q.orderBy('firstName').orderBy('persons.age', 'desc', 'last');
  await q.orderBy(['firstName', { column: 'age', order: 'desc' }]);
  await q.groupBy('firstName', 'lastName').groupBy(['age']);

  // @ts-expect-error
  await q.whereIn('ids', [1, 2]);
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

  // Objects are checked with excess property checks.
  await q.where({ firstName: 'Jennifer', 'persons.age': 30 });
  // @ts-expect-error
  await q.where({ firstNme: 'Jennifer' });

  // `findOne()` takes the same arguments as `where()`.
  await Person.query().findOne('firstName', 'Jennifer');
  await Person.query().findOne({ firstName: 'Jennifer' });
  // @ts-expect-error
  await Person.query().findOne('firstNme', 'Jennifer');

  // Callbacks get the query builder with its scope.
  await Person.query()
    .joinRelated('pets')
    .where((qb) => qb.where('pets.name', 'Fluffy').orWhere('firstName', 'Jennifer'));
  await Person.query().where((qb) => {
    // @ts-expect-error
    qb.where('pets.name', 'Fluffy');
  });
}

async function selections() {
  await Person.query().select('id', 'persons.firstName', 'persons.*', '*');
  await Person.query().select(['id', 'firstName']);
  await Person.query().select('firstName as name', raw('1'), ref('age'), 1);
  await Person.query().columns({ name: 'firstName' }).distinct('lastName');
  await Person.query().select(Animal.query().count().as('petCount'));
  // @ts-expect-error
  await Person.query().select('id', 'firstNme');
  // @ts-expect-error
  await Person.query().select('firstNme as name');
  // @ts-expect-error unknown table
  await Person.query().select('people.*');
  // @ts-expect-error
  await Person.query().select({ name: 'firstNme' });

  // Aliases of selections can be used in orderBy(), groupBy() and having(),
  // but not in where(), as in SQL.
  await Person.query().select('firstName as name').orderBy('name').groupBy('name');
  await Person.query().select({ name: 'firstName' }).orderBy('name');
  await Person.query().count('id as petCount').orderBy('petCount');
  await Person.query().count('id', { as: 'petCount' }).having('petCount', '>', 1);
  await Person.query().max({ oldest: 'age' }).orderBy('oldest');
  await Person.query().sum('age as total').orderBy('total');
  // @ts-expect-error
  await Person.query().select('firstName as name').where('name', 'Jennifer');
  // @ts-expect-error
  await Person.query().select('firstName as name').orderBy('nme');
  // @ts-expect-error
  await Person.query().count('id as petCount').orderBy('count');

  // Raw and subquery selections can have any alias.
  await Person.query().select(raw('count(*) as cnt')).orderBy('cnt');
  await Person.query().select(Animal.query().count().as('cnt')).orderBy('cnt');

  // Aggregates check their columns.
  await Person.query().count().count('*').count('id', 'age').countDistinct('age');
  await Person.query().min('age').max('persons.age').avg('age').sumDistinct('age');
  // @ts-expect-error
  await Person.query().count('agee');
  // @ts-expect-error
  await Person.query().min('agee');
}

async function openScopes() {
  // Plain joins, from(), with() and raw joins open the scope: any column is
  // accepted after them, as they can't be checked.
  await Person.query().join('animals', 'persons.id', 'animals.ownerId').where('animals.x', 1);
  await Person.query().leftJoin('animals', 'persons.id', 'animals.ownerId').orderBy('x');
  await Person.query().joinRaw('join animals on true').where('anything', 1);
  await Person.query().from('persons as p').where('p.firstName', 'Jennifer');
  await Person.query()
    .with('t', Animal.query())
    .join('t', 't.ownerId', 'persons.id')
    .where('t.name', 'Fluffy');
  await Person.query().with('t', Animal.query()).where('t.name', 'Fluffy');
  await Person.query().aliasFor(Animal, 'a').where('a.name', 'Fluffy');
  // The scope only opens from there on, as the scope is built up in order.
  // @ts-expect-error
  await Person.query().where('animals.x', 1).join('animals', 'persons.id', 'animals.ownerId');

  // Raw and ref() are always accepted, e.g. for columns of outer queries.
  await Animal.query().whereColumn('animals.ownerId', ref('persons.id'));
  await Person.query().where(ref('anything'), 1).where(raw('anything = 1'));
  await Person.query().orderBy(raw('anything')).groupBy(ref('anything'));
  // @ts-expect-error a column of the outer query needs ref()
  await Animal.query().whereColumn('animals.ownerId', 'persons.age');
  // Unless it happens to match a root column, as root columns can be
  // qualified with any name without a literal `static tableName`.
  await Animal.query().whereColumn('animals.ownerId', 'persons.id');

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

async function dynamicColumns(column: string, personColumn: 'firstName' | 'lastName') {
  // Unions of literals are checked, plain strings are not accepted.
  await Person.query().where(personColumn, 'Jennifer').orderBy(personColumn);
  // @ts-expect-error use ref() for dynamic columns
  await Person.query().orderBy(column);
  await Person.query().orderBy(ref(column));
}

// Generic code is checked loosely, as the columns can't be resolved there.

export class GenericQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  byName(name: string) {
    return this.where('name', name).orderBy('name');
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
}

function generic<M extends Model>(query: QueryBuilder<M>) {
  return query.where('anything', 1).whereIn('anything', [1]).orderBy('anything');
}

function genericPersons<QB extends QueryBuilder<Person>>(query: QB) {
  return query.where('anything', 1);
}

async function customQueryBuilders() {
  await CustomPerson.query().where('firstName', 'Jennifer').someCustomMethod();
  await CustomPerson.query().someCustomMethod().where('firstName', 'Jennifer');
  // @ts-expect-error
  await CustomPerson.query().someCustomMethod().where('firstNme', 'Jennifer');
  // Custom query builders remain assignable to QueryBuilder.
  const qb: QueryBuilder<CustomPerson> = CustomPerson.query();
}
