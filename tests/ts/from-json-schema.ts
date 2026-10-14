// Type tests for FromJSONSchema: model properties derived from `static
// jsonSchema`, declared `as const`.

import { FromJSONSchema, JSONSchema, Model, ModelObject, ReadonlyJSONSchema } from 'objection';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export class Owner extends Model {
  static tableName = 'owners';
  static jsonSchema = {
    type: 'object',
    required: ['id', 'firstName', 'createdAt'],
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string', minLength: 1 },
      lastName: { type: ['string', 'null'] },
      nickName: { type: 'string', nullable: true },
      age: { type: 'number' },
      active: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
      role: { enum: ['admin', 'user'] },
      status: { type: ['string', 'null'], enum: ['new', 'done', null] },
      level: { type: 'string', enum: ['low', 'high', null] },
      kind: { const: 'owner' },
      tags: { type: 'array', items: { type: 'string' } },
      point: {
        type: 'array',
        items: [{ type: 'number' }, { type: 'number' }],
        minItems: 2,
        additionalItems: false,
      },
      pair: { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
      address: {
        type: 'object',
        required: ['street'],
        properties: {
          street: { type: 'string' },
          zip: { type: 'integer' },
        },
      },
      settings: { type: 'object' },
      score: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
      anything: {},
    },
  } as const;

  // Relations are still declared by hand.
  pets?: Pet[];

  // Methods too.
  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

export interface Owner extends FromJSONSchema<typeof Owner.jsonSchema> {}

export class Pet extends Model {
  static tableName = 'pets';
  static jsonSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      ownerId: { type: ['integer', 'null'] },
    },
  } as const;

  owner?: Owner;
}

export interface Pet extends FromJSONSchema<typeof Pet.jsonSchema> {}

declare const owner: Owner;

type Props = {
  id: number;
  firstName: string;
  createdAt: string;
  lastName?: string | null;
  nickName?: string | null;
  age?: number;
  active?: boolean;
  role?: 'admin' | 'user';
  status?: 'new' | 'done' | null;
  level?: 'low' | 'high';
  kind?: 'owner';
  tags?: string[];
  point?: [number, number];
  pair?: [string?, number?, ...unknown[]];
  address?: { street: string; zip?: number };
  settings?: { [key: string]: unknown };
  score?: number | string;
  anything?: unknown;
};

type _props = Expect<Equal<FromJSONSchema<typeof Owner.jsonSchema>, Props>>;
type _instance = Expect<Equal<Owner['address'], Props['address']>>;

// ModelObject picks up the derived properties.
type _object = Expect<Equal<ModelObject<Owner>['address'], Props['address']>>;
type _objectKeys = Expect<Equal<Exclude<keyof Props, keyof ModelObject<Owner>>, never>>;

async function usage() {
  owner.firstName.toUpperCase();
  owner.fullName();
  // @ts-expect-error optional
  owner.age.toFixed();
  // @ts-expect-error
  owner.role = 'guest';

  await Owner.query().where('firstName', 'Jennifer').where('role', 'admin');

  // Narrowing of hand-declared relations works as usual.
  const pets = await Pet.query().withGraphFetched('owner');
  pets[0].owner.firstName;
  const owners = await Owner.query().withGraphFetched('pets');
  owners[0].pets[0].name.toUpperCase();

  // Inserts and patches take the derived properties.
  await Pet.query().insert({ name: 'Fluffy', ownerId: 1 });
  await Pet.query().patch({ ownerId: null });
  // @ts-expect-error
  await Pet.query().insert({ name: 1 });
}

// Models that subclasses extend with their own schema declare `static
// jsonSchema` with its general type, as an `as const` schema types it with
// its literal type, which the schema of a subclass can't be assigned to.
const baseSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer' },
  },
} as const;

class BaseRecord extends Model {
  static jsonSchema: ReadonlyJSONSchema = baseSchema;
}

interface BaseRecord extends FromJSONSchema<typeof baseSchema> {}

const noteSchema = {
  type: 'object',
  required: [...baseSchema.required, 'text'],
  properties: {
    ...baseSchema.properties,
    text: { type: 'string' },
  },
} as const;

class Note extends BaseRecord {
  static jsonSchema = noteSchema;
}

interface Note extends FromJSONSchema<typeof noteSchema> {}

type _note = Expect<Equal<FromJSONSchema<typeof noteSchema>, { id: number; text: string }>>;
declare const note: Note;
note.id.toFixed();
note.text.toUpperCase();

class InlineBase extends Model {
  static jsonSchema = baseSchema;
}

// @ts-expect-error the literal type of the base schema
class InlineSub extends InlineBase {
  static jsonSchema = noteSchema;
}

// `static jsonSchema` takes mutable and `as const` schemas.
const mutableSchema: JSONSchema = { type: 'object', required: ['a'] };
const readonlySchema: ReadonlyJSONSchema = { type: 'object', required: ['a'] } as const;

class MutableSchemaModel extends Model {
  static jsonSchema: JSONSchema = mutableSchema;
}

class ReadonlySchemaModel extends Model {
  static jsonSchema = readonlySchema;
}

// Variants of schema details.

type Nullable = FromJSONSchema<{ type: ['integer', 'null'] }>;
type _nullable = Expect<Equal<Nullable, number | null>>;
type Items = FromJSONSchema<{
  type: 'array';
  items: { type: 'object'; properties: { a: { type: 'string' } } };
}>;
type _items = Expect<Equal<Items, { a?: string }[]>>;
type NoRequired = FromJSONSchema<{ type: 'object'; properties: { a: { type: 'string' } } }>;
type _noRequired = Expect<Equal<NoRequired, { a?: string }>>;
type OneOf = FromJSONSchema<{ oneOf: readonly [{ type: 'string' }, { type: 'null' }] }>;
type _oneOf = Expect<Equal<OneOf, string | null>>;
type Untyped = FromJSONSchema<{ description: 'x' }>;
type _untyped = Expect<Equal<Untyped, unknown>>;
type ConditionalRequired = FromJSONSchema<{
  type: 'object';
  required: ['id'];
  properties: { id: { type: 'integer' }; email: { type: 'string' } };
  anyOf: [{ required: ['email'] }, { required: ['id'] }];
}>;
type _conditionalRequired = Expect<Equal<ConditionalRequired, { id: number; email?: string }>>;
type TypeAndAnyOf = FromJSONSchema<{
  type: 'string';
  anyOf: [{ format: 'email' }, { format: 'uri' }];
}>;
type _typeAndAnyOf = Expect<Equal<TypeAndAnyOf, string>>;
type TypeAndOneOf = FromJSONSchema<{ type: 'integer'; oneOf: [{ minimum: 0 }, { maximum: -10 }] }>;
type _typeAndOneOf = Expect<Equal<TypeAndOneOf, number>>;
// `type` narrows `enum` and `const`, as validation checks both.
type NullableEnum = FromJSONSchema<{ type: 'string'; enum: ['a', 'b']; nullable: true }>;
type _nullableEnum = Expect<Equal<NullableEnum, 'a' | 'b'>>;
type NullableEnumWithNull = FromJSONSchema<{ type: 'string'; enum: ['a', null]; nullable: true }>;
type _nullableEnumWithNull = Expect<Equal<NullableEnumWithNull, 'a' | null>>;
type TypedConst = FromJSONSchema<{ type: 'integer'; const: 1 }>;
type _typedConst = Expect<Equal<TypedConst, 1>>;
type EmptyObject = FromJSONSchema<{ type: 'object'; properties: {} }>;
type _emptyObject = Expect<Equal<EmptyObject, { [key: string]: unknown }>>;
type AdditionalItems = FromJSONSchema<{
  type: 'array';
  items: [{ type: 'string' }];
  additionalItems: { type: 'number' };
}>;
type _additionalItems = Expect<Equal<AdditionalItems, [string?, ...number[]]>>;
type Bool = FromJSONSchema<true>;
type _bool = Expect<Equal<Bool, unknown>>;
