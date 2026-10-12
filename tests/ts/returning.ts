// Type tests for the result kind of writes with returning(): one row for
// single and maybe-single query builders, e.g. after findById(), first(),
// $query() or $relatedQuery() of a to-one relation, and arrays otherwise.

import { MaybeSingleQueryBuilder, NumberQueryBuilder, QueryBuilder } from 'objection';
import { Person } from './fixtures/person.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

async function afterWrite(person: Person) {
  const patched = await person.$query().patch({ age: 1 }).returning('*');
  type _patched = Expect<Equal<typeof patched, Person>>;
  const updated = await person.$query().update({ lastName: 'Lawrence' }).returning('*');
  type _updated = Expect<Equal<typeof updated, Person>>;
  const deleted = await person.$query().delete().returning('*');
  type _deleted = Expect<Equal<typeof deleted, Person>>;

  const byId = await Person.query().findById(1).patch({ age: 1 }).returning('*');
  type _byId = Expect<Equal<typeof byId, Person | undefined>>;
  const first = await Person.query().first().delete().returning('*');
  type _first = Expect<Equal<typeof first, Person | undefined>>;
  const chained = await Person.query()
    .findById(1)
    .patch({ age: 1 })
    .where('age', '>', 1)
    .returning('*');
  type _chained = Expect<Equal<typeof chained, Person | undefined>>;
  const patchById = await Person.query().patchById(1, { age: 1 }).returning('*');
  type _patchById = Expect<Equal<typeof patchById, Person | undefined>>;
  const updateById = await Person.query().updateById(1, { lastName: 'x' }).returning('*');
  type _updateById = Expect<Equal<typeof updateById, Person | undefined>>;
  const deleteById = await Person.query().deleteById(1).returning('*');
  type _deleteById = Expect<Equal<typeof deleteById, Person | undefined>>;
  const toOne = await person.$relatedQuery('mom').patch({ age: 1 }).returning('*');
  type _toOne = Expect<Equal<typeof toOne, Person | undefined>>;

  const all = await Person.query().patch({ age: 1 }).returning('*');
  type _all = Expect<Equal<typeof all, Person[]>>;
  const toOneStatic = await Person.relatedQuery('mom').for(1).delete().returning('*');
  type _toOneStatic = Expect<Equal<typeof toOneStatic, Person[]>>;
  const toMany = await person.$relatedQuery('children').update({ lastName: 'x' }).returning('*');
  type _toMany = Expect<Equal<typeof toMany, Person[]>>;

  // The *ById() writes are writes of findById(), as the helper types say.
  const query = Person.query().patchById(1, { age: 1 });
  type _query = Expect<
    Equal<typeof query, NumberQueryBuilder<MaybeSingleQueryBuilder<QueryBuilder<Person>>>>
  >;

  // Without returning(), writes resolve to the number of rows.
  const count = await Person.query().findById(1).patch({ age: 1 });
  type _count = Expect<Equal<typeof count, number>>;
}

async function beforeWrite(person: Person) {
  const patched = await person.$query().returning('*').patch({ age: 1 });
  type _patched = Expect<Equal<typeof patched, Person>>;
  // patch() takes field expression keys, also after returning().
  const field = await person.$query().returning('*').patch({ 'address:street': 'x' });
  type _field = Expect<Equal<typeof field, Person>>;
  const deleted = await Person.query().findById(1).returning('*').delete();
  type _deleted = Expect<Equal<typeof deleted, Person | undefined>>;
  const toOne = await person.$relatedQuery('mom').returning('*').update({ lastName: 'x' });
  type _toOne = Expect<Equal<typeof toOne, Person | undefined>>;

  // Finds keep their result.
  const found = await Person.query().returning('*').where('age', 1);
  type _found = Expect<Equal<typeof found, Person[]>>;
}
