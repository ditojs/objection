// Type tests for the value checks of strict mode: values of conditions are
// checked against the types of their columns.

import './strict-mode';
import { raw, ref, val } from 'objection';
import { Animal, Person } from './models';

async function values() {
  await Person.query().where('age', 30).where('firstName', 'Jennifer');
  await Person.query().where('active', true).where('tags', ['a']);
  // @ts-expect-error
  await Person.query().where('age', 'x');
  // @ts-expect-error
  await Person.query().where('firstName', 1);
  // @ts-expect-error
  await Person.query().where('active', 1);

  // null is always accepted, for `IS NULL` checks.
  await Person.query().where('firstName', null);

  // Optional properties accept their defined type.
  await Person.query().where('lastName', 'Lawrence');
  // @ts-expect-error
  await Person.query().where('lastName', 1);

  // Literal union types, e.g. enums.
  await Animal.query().where('species', 'dog');
  // @ts-expect-error
  await Animal.query().where('species', 'cow');

  // Dates accept strings too.
  await Person.query().where('createdAt', '>', new Date()).where('createdAt', '<', '2020-01-01');
  // @ts-expect-error
  await Person.query().where('createdAt', '>', 1);

  // Object (JSON) columns accept anything.
  await Person.query().where('address', { street: 'x' });

  // Expressions are accepted for any column.
  await Person.query()
    .where('age', ref('persons.id'))
    .where('age', raw('1'))
    .where('age', val(1))
    .where('age', Person.query().max('age'));

  // With operators, arrays are accepted too, for 'in' and 'between'.
  await Person.query().where('age', '>', 30).where('age', 'in', [1, 2]);
  // @ts-expect-error
  await Person.query().where('age', '>', 'x');
  // @ts-expect-error
  await Person.query().where('age', 'in', ['x']);

  // Qualified and joined columns.
  await Person.query().where('persons.age', 30);
  await Person.query().joinRelated('pets').where('pets.species', 'cat');
  // @ts-expect-error
  await Person.query().where('persons.age', 'x');
  // @ts-expect-error
  await Person.query().joinRelated('pets').where('pets.species', 'cow');

  // whereIn(), whereBetween() and objects.
  await Person.query().whereIn('age', [1, 2]).whereBetween('age', [1, 2]);
  await Person.query().where({ age: 30, firstName: 'Jennifer' });
  // @ts-expect-error
  await Person.query().whereIn('age', ['x']);
  // @ts-expect-error
  await Person.query().whereBetween('age', [1, 'x']);
  // @ts-expect-error
  await Person.query().where({ age: 'x' });

  // Like methods take strings, regardless of the column type.
  await Person.query().whereLike('firstName', 'Jen%');

  // Output aliases accept any value.
  await Person.query().count('id as cnt').having('cnt', '>', 1);

  // Columns in an open scope accept any primitive value.
  await Person.query().join('animals', 'persons.id', 'animals.ownerId').where('age', 'x');
}
