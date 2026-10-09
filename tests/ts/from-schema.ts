// Type tests for FromSchema without strict mode: as `static jsonSchema` only
// accepts mutable schemas there, the schema is declared separately `as const`
// and assigned `as unknown as JSONSchema` (readonly arrays can't be asserted
// to mutable ones directly). See tests/ts/strict/from-schema.ts for more.

import { FromSchema, JSONSchema, Model } from '../../';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const personSchema = {
  type: 'object',
  required: ['firstName'],
  properties: {
    id: { type: 'integer' },
    firstName: { type: 'string' },
    age: { type: ['integer', 'null'] },
  },
} as const;

class Person extends Model {
  static tableName = 'persons';
  static jsonSchema = personSchema as unknown as JSONSchema;

  pets?: Animal[];
}

interface Person extends FromSchema<typeof personSchema> {}

class Animal extends Model {
  static tableName = 'animals';
  name!: string;
}

type _first = Expect<Equal<Person['firstName'], string>>;
type _age = Expect<Equal<Person['age'], number | null | undefined>>;

async function usage() {
  const people = await Person.query().where('firstName', 'Jennifer').withGraphFetched('pets');
  people[0].firstName.toUpperCase();
  people[0].pets.length;
  // @ts-expect-error
  people[0].age.toFixed();
}

// `as const` directly on `static jsonSchema` is only accepted in strict mode.
// @ts-expect-error
class InlinePerson extends Model {
  static jsonSchema = { type: 'object', required: ['a'], properties: {} } as const;
}
