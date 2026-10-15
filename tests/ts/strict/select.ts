// Type tests for the narrowing of result rows by select() and the aggregates
// in strict mode.

import { Page, raw, ref } from 'objection';
import { Animal, CustomPerson, Person } from './models.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

async function selections() {
  // Selected columns, also qualified, and aliases with the column's type.
  const rows = await Person.query().select('id', 'persons.firstName', 'age as years');
  type Row = (typeof rows)[number];
  type _id = Expect<Equal<Row['id'], number>>;
  type _firstName = Expect<Equal<Row['firstName'], string>>;
  type _years = Expect<Equal<Row['years'], number | null>>;
  // @ts-expect-error not selected
  rows[0].lastName;
  // The rows keep the model's methods and relations.
  rows[0].fullName();
  rows[0].pets?.length;

  // Objects select columns under aliases.
  const named = await Person.query().columns({ name: 'firstName' });
  type _name = Expect<Equal<(typeof named)[number]['name'], string>>;

  // Repeated selections add up.
  const added = await Person.query().select('id').select('firstName');
  added[0].id;
  added[0].firstName;

  // `*` and `select()` without columns keep the columns, and `*` adds the
  // other selections, also before and after them.
  const all: Person[] = await Person.query().select('*');
  const none: Person[] = await Person.query().select();
  const before = await Person.query().select('*').select('id as key');
  type _before = Expect<Equal<(typeof before)[number]['lastName'], string | undefined>>;
  before[0].key;
  const after = await Person.query().select('id').select('persons.*');
  type _after = Expect<Equal<(typeof after)[number]['lastName'], string | undefined>>;
  const counted = await Person.query().select('persons.*').count('id as n').groupBy('id');
  counted[0].firstName;
  counted[0].n;
  const extra = await Person.query().select('persons.*', raw('1 as one'));
  extra[0].lastName;
  extra[0].one;

  // Raw, ref() and subquery selections can have any alias, of unknown type.
  const raws = await Person.query().select('id', raw('count(*) as n'));
  type _raw = Expect<Equal<(typeof raws)[number]['n'], unknown>>;
  const counts = await Person.query().select('id', Animal.query().count().as('petCount'));
  counts[0].petCount;
}

async function resultKinds() {
  const first = await Person.query().select('id').first();
  type _first = Expect<Equal<NonNullable<typeof first>['id'], number>>;
  // @ts-expect-error not selected
  first?.firstName;
  const byId = await Person.query().findById(1).select('firstName').throwIfNotFound();
  byId.firstName;
  const aliased = await Person.query().select('age as years').first().throwIfNotFound();
  type _aliased = Expect<Equal<typeof aliased.years, number | null>>;
  // @ts-expect-error not selected
  byId.age;
  const page = await Person.query().select('id').page(0, 10);
  page.results[0].id;
  type _page = Expect<Equal<typeof page, Page<(typeof page)['results'][number]>>>;

  // withGraph*() adds the relations, before or after select().
  const before = await Person.query().withGraphFetched('pets').select('id');
  before[0].pets.length;
  before[0].id;
  const after = await Person.query().select('id').withGraphFetched('pets');
  after[0].pets.length;
  // @ts-expect-error not selected
  after[0].firstName;

  // Custom query builders keep their type.
  const custom = CustomPerson.query().select('id').first().someCustomMethod();
  (await custom)?.id;
}

async function aggregates() {
  const counts = await Person.query().count('id as n').first();
  type _n = Expect<Equal<NonNullable<typeof counts>['n'], number | string>>;
  const named = await Person.query().count('id', { as: 'total' }).countDistinct({ ages: 'age' });
  named[0].total;
  named[0].ages;
  const extremes = await Person.query().max('age as oldest').min('createdAt as first');
  type _oldest = Expect<Equal<(typeof extremes)[number]['oldest'], number | null>>;
  type _min = Expect<Equal<(typeof extremes)[number]['first'], Date>>;
  const sums = await Person.query().select('firstName').sum('age as total').groupBy('firstName');
  type _sum = Expect<Equal<(typeof sums)[number]['total'], number | string>>;
  sums[0].firstName;
}

async function aliases() {
  // Aliases of selections can be used in orderBy(), but not in where(), as in
  // SQL. groupBy() and having() need ref(), as not all databases support them.
  await Person.query().select('firstName as name').orderBy('name').groupBy(ref('name'));
  await Person.query()
    .columns({ name: 'firstName' })
    .orderBy([{ column: 'name' }]);
  await Person.query().count('id as n').having(ref('n'), '>', 1).orderBy('n');
  await Person.query().select(raw('count(*) as cnt')).orderBy('cnt');
  await Person.query().count().orderBy('anything');
  await Person.query().select('*').select('id as key').orderBy('key');
  // @ts-expect-error
  await Person.query().select('firstName as name').where('name', 'Jennifer');
  // @ts-expect-error
  await Person.query().select('firstName as name').groupBy('name');
  // @ts-expect-error
  await Person.query().count('id as n').having('n', '>', 1);
  // @ts-expect-error
  await Person.query().select('firstName as name').orderBy('nme');
  // @ts-expect-error
  await Person.query().count('id as n').orderBy('count');
  // Columns that aren't selected can still be used, as in SQL.
  await Person.query().select('id').where('age', '>', 1).orderBy('lastName');
  await Person.query().select('id').orderBy(ref('anything'));
}

async function indexSignature() {
  // The rows keep the implicit index signature of object types.
  const row: Record<string, unknown> = (await Person.query().select('id', 'firstName as name'))[0];
  const counts: Record<string, unknown> | undefined = await Person.query().count('id as n').first();
}

async function distinctOn() {
  // distinctOn() checks its columns, but doesn't select them.
  const all = await Person.query().distinctOn('id');
  all[0].firstName;
  const selected = await Person.query().distinctOn('id').select('firstName');
  selected[0].firstName;
  // @ts-expect-error not selected
  selected[0].id;
  // @ts-expect-error
  await Person.query().distinctOn('nme');
}

async function clearSelect() {
  // clearSelect() selects all columns again.
  const cleared = await Person.query().select('id as key').clearSelect();
  cleared[0].firstName;
  // @ts-expect-error not selected
  cleared[0].key;
  const reselected = await Person.query().select('id').clearSelect().select('firstName');
  reselected[0].firstName;
  // @ts-expect-error not selected
  reselected[0].id;
  const first = await Person.query().count('id as n').clearSelect().first();
  type _first = Expect<Equal<typeof first, Person | undefined>>;
  const custom = CustomPerson.query().select('id').clearSelect().someCustomMethod();
  (await custom)[0].firstName;
}

async function jsonExtract() {
  // jsonExtract() adds its alias, of unknown type, to all columns or to the
  // selected ones, before or after select().
  const extracted = await Person.query().jsonExtract('address', '$.street', 'street');
  type _street = Expect<Equal<(typeof extracted)[number]['street'], unknown>>;
  extracted[0].firstName;
  const before = await Person.query().jsonExtract('address', '$.street', 'street').select('id');
  before[0].street;
  // @ts-expect-error not selected
  before[0].firstName;
  const after = await Person.query().select('id').jsonExtract('address', '$.street', 'street');
  after[0].street;
  // @ts-expect-error not selected
  after[0].firstName;
  await Person.query().jsonExtract('address', '$.street', 'street').orderBy('street');
  // @ts-expect-error
  await Person.query().jsonExtract('address', '$.street', 'street').orderBy('town');
  const row: Record<string, unknown> = after[0];
  // It survives clearSelect(), as it isn't a select, and withGraph*().
  const cleared = await Person.query().jsonExtract('address', '$.street', 'street').clearSelect();
  cleared[0].street;
  const clearedBefore = await Person.query()
    .jsonExtract('address', '$.street', 'street')
    .select('id')
    .clearSelect();
  clearedBefore[0].street;
  clearedBefore[0].firstName;
  const clearedAfter = await Person.query()
    .select('id')
    .jsonExtract('address', '$.street', 'street')
    .clearSelect()
    .first();
  type _clearedAfter = Expect<Equal<NonNullable<typeof clearedAfter>['street'], unknown>>;
  clearedAfter?.firstName;
  const fetched = await Person.query()
    .jsonExtract('address', '$.street', 'street')
    .withGraphFetched('pets');
  fetched[0].street;
  fetched[0].pets.length;
  const joined = await Person.query()
    .jsonExtract('address', '$.street', 'street')
    .withGraphJoined('pets')
    .first()
    .throwIfNotFound();
  joined.street;
  joined.pets.length;
  // Extractions without aliases add any properties.
  const unnamed = await Person.query()
    .select('id')
    .jsonExtract([['address', '$.street']]);
  unnamed[0].street;
}
