// Type tests for the value checks of strict mode: values of conditions are
// checked against the types of their columns.

import { raw, ref, val } from 'objection';
import { Animal, Person, Program } from './models.js';

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

  // Generated columns are checked against the types they wrap.
  await Program.query().where('id', 1).where('createdAt', '<', '2020-01-01');
  // @ts-expect-error
  await Program.query().where('id', 'x');
  // @ts-expect-error
  await Program.query().where('createdAt', '<', 1);

  // Object (JSON) columns accept anything.
  await Person.query().where('address', { street: 'x' });
  await Person.query().where('settings', '@>', { theme: 'dark', other: 1 });
  await Person.query().where('meta', { a: 1 }).where('extra', '@>', { a: 1 });
  await Person.query().where({ meta: { a: 1 } });

  // Nullable dates accept strings too.
  await Person.query().where('deletedAt', '<', '2020-01-01').where('deletedAt', null);
  await Person.query().whereBetween('deletedAt', ['2020-01-01', new Date()]);
  await Person.query().where({ deletedAt: '2020-01-01' });

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

  // Columns of relations.
  await Person.query().joinRelated('pets').where('pets.species', 'cat');
  // @ts-expect-error
  await Person.query().joinRelated('pets').where('pets.species', 'cow');
  // Qualifiers that aren't relations accept any value.
  await Person.query().where('persons.age', 'x');

  // whereIn(), whereBetween() and objects.
  await Person.query().whereIn('age', [1, 2]).whereBetween('age', [1, 2]);
  await Person.query().where({ age: 30, firstName: 'Jennifer' });
  // @ts-expect-error
  await Person.query().whereIn('age', ['x']);
  // @ts-expect-error
  await Person.query().whereBetween('age', [1, 'x']);
  // @ts-expect-error
  await Person.query().where({ age: 'x' });

  // Operators other than comparisons take any value.
  await Animal.query().where('species', 'like', 'd%').where('species', 'ILIKE', 'D%');
  await Person.query().where('age', '~', '^1');
  // @ts-expect-error comparisons are still checked
  await Animal.query().where('species', '=', 'cow');
  // @ts-expect-error
  await Animal.query().where('species', 'in', ['cow']);

  // Like methods take strings, regardless of the column type.
  await Person.query().whereLike('age', '1%');
}
