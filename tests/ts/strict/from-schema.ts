// Type tests for FromSchema: model properties derived from `static
// jsonSchema`. In strict mode, the schema can be declared inline `as const`.

import './strict-mode';
import { FromSchema, Model, ModelObject } from 'objection';
import { Equal, Expect } from './strict-mode';

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
      status: { type: 'string', enum: ['new', 'done', null] },
      kind: { const: 'owner' },
      tags: { type: 'array', items: { type: 'string' } },
      point: { type: 'array', items: [{ type: 'number' }, { type: 'number' }] },
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

export interface Owner extends FromSchema<typeof Owner.jsonSchema> {}

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

export interface Pet extends FromSchema<typeof Pet.jsonSchema> {}

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
  kind?: 'owner';
  tags?: string[];
  point?: [number, number];
  address?: { street: string; zip?: number };
  settings?: { [key: string]: unknown };
  score?: number | string;
  anything?: unknown;
};

type _props = Expect<Equal<FromSchema<typeof Owner.jsonSchema>, Props>>;
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

  // Strict mode checks queries against the derived columns.
  await Owner.query().where('firstName', 'Jennifer').where('role', 'admin');
  await Owner.query().joinRelated('pets').where('pets.ownerId', null);
  // @ts-expect-error
  await Owner.query().where('firstNme', 'Jennifer');
  // @ts-expect-error
  await Owner.query().where('role', 'guest');
  // @ts-expect-error
  await Owner.query().joinRelated('pets').where('pets.nme', 'Fluffy');

  // Narrowing of hand-declared relations works as usual.
  const pets = await Pet.query().withGraphFetched('owner');
  pets[0].owner.firstName;

  // Inserts take the derived properties.
  await Pet.query().insert({ name: 'Fluffy', ownerId: 1 });
  // @ts-expect-error
  await Pet.query().insert({ name: 1 });
}

// Variants of schema details.

type Nullable = FromSchema<{ type: ['integer', 'null'] }>;
type _nullable = Expect<Equal<Nullable, number | null>>;
type Items = FromSchema<{
  type: 'array';
  items: { type: 'object'; properties: { a: { type: 'string' } } };
}>;
type _items = Expect<Equal<Items, { a?: string }[]>>;
type NoRequired = FromSchema<{ type: 'object'; properties: { a: { type: 'string' } } }>;
type _noRequired = Expect<Equal<NoRequired, { a?: string }>>;
type OneOf = FromSchema<{ oneOf: readonly [{ type: 'string' }, { type: 'null' }] }>;
type _oneOf = Expect<Equal<OneOf, string | null>>;
type Untyped = FromSchema<{ description: 'x' }>;
type _untyped = Expect<Equal<Untyped, unknown>>;
