// Type tests for FromModel: model properties derived from `static jsonSchema`
// and `static relationMappings`.

import {
  FromModel,
  FromJSONSchema,
  Model,
  ModelObject,
  ReadonlyJSONSchema,
  RelationMappings,
} from 'objection';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export class Owner extends Model {
  static tableName = 'owners';
  static jsonSchema = {
    type: 'object',
    required: ['id', 'firstName'],
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string' },
      bossId: { type: ['integer', 'null'] },
    },
  } as const;

  static relationMappings = () => ({
    boss: {
      relation: Model.BelongsToOneRelation,
      modelClass: Owner,
      join: { from: 'owners.bossId', to: 'owners.id' },
    },
    employees: {
      relation: Model.HasManyRelation,
      modelClass: Owner,
      join: { from: 'owners.id', to: 'owners.bossId' },
    },
    pets: {
      relation: Model.HasManyRelation,
      modelClass: () => Pet,
      join: { from: 'owners.id', to: 'pets.ownerId' },
    },
    favoritePet: {
      relation: Model.HasOneRelation,
      modelClass: () => Pet,
      join: { from: 'owners.favoritePetId', to: 'pets.id' },
    },
    toys: {
      relation: Model.ManyToManyRelation,
      modelClass: () => Toy,
      join: {
        from: 'owners.id',
        through: { from: 'owners_toys.ownerId', to: 'owners_toys.toyId' },
        to: 'toys.id',
      },
    },
    // Module paths can't be resolved.
    friends: {
      relation: Model.HasManyRelation,
      modelClass: 'owner',
      join: { from: 'owners.id', to: 'owners.friendId' },
    },
  });

  fullName() {
    return `${this.firstName}`;
  }
}

export interface Owner extends FromModel<typeof Owner> {}

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

  // A static property and a getter work as well as a thunk.
  static relationMappings = {
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Owner,
      join: { from: 'pets.ownerId', to: 'owners.id' },
    },
  };
}

export interface Pet extends FromModel<typeof Pet> {}

// Models with mappings and no schema.
export class Toy extends Model {
  static tableName = 'toys';
  static get relationMappings() {
    return {
      owners: {
        relation: Model.ManyToManyRelation,
        modelClass: Owner,
        join: {
          from: 'toys.id',
          through: { from: 'owners_toys.toyId', to: 'owners_toys.ownerId' },
          to: 'owners.id',
        },
      },
      bestFriendOwner: {
        relation: Model.HasOneThroughRelation,
        modelClass: Owner,
        join: {
          from: 'toys.id',
          through: { from: 'best_friends.toyId', to: 'best_friends.ownerId' },
          to: 'owners.id',
        },
      },
      siblings: {
        relation: Model.BelongsToManyRelation,
        modelClass: Toy,
        join: { from: 'toys.siblingIds', to: 'toys.id' },
      },
    };
  }
}

export interface Toy extends FromModel<typeof Toy> {}

type _owner = Expect<
  Equal<
    { [K in keyof FromModel<typeof Owner>]: FromModel<typeof Owner>[K] },
    {
      id: number;
      firstName: string;
      bossId?: number | null;
      boss?: Owner | null;
      employees?: Owner[];
      pets?: Pet[];
      favoritePet?: Pet | null;
      toys?: Toy[];
    }
  >
>;
type _pet = Expect<Equal<Pet['owner'], Owner | null | undefined>>;
type _toy = Expect<
  Equal<
    { [K in keyof FromModel<typeof Toy>]: FromModel<typeof Toy>[K] },
    { owners?: Owner[]; bestFriendOwner?: Owner | null; siblings?: Toy[] }
  >
>;
type _friends = Expect<Equal<'friends' extends keyof Owner ? true : false, false>>;

// ModelObject picks up the derived properties.
type _object = Expect<Equal<ModelObject<Owner>['bossId'], number | null | undefined>>;

async function usage() {
  const owner = await Owner.query().findById(1).throwIfNotFound();
  owner.firstName.toUpperCase();
  owner.fullName();
  // @ts-expect-error possibly undefined or null
  owner.boss.firstName;

  // Fetched relations are narrowed, and to-one relations stay nullable.
  const owners = await Owner.query().withGraphFetched('[boss.pets, employees]');
  owners[0].employees[0].firstName;
  owners[0].boss?.pets[0].name.toUpperCase();
  // @ts-expect-error possibly null
  owners[0].boss.pets;

  const joined = await Owner.query().withGraphJoined('boss');
  joined[0].boss?.firstName;
  // @ts-expect-error possibly null
  joined[0].boss.firstName;

  const boss = await owner.$relatedQuery('boss');
  type _boss = Expect<Equal<typeof boss, Owner | undefined>>;
  await Owner.query().upsertGraph({ id: 1, firstName: 'Jennifer', boss: null });

  const pets = await Owner.relatedQuery('pets').for(1);
  pets[0].name.toUpperCase();

  await Owner.query().insertGraph({ firstName: 'Jennifer', pets: [{ name: 'Fluffy' }] });
  // @ts-expect-error
  await Owner.query().insertGraph({ firstName: 'Jennifer', pets: [{ name: 1 }] });
}

// A schema and mappings with their general types, e.g. on models that
// subclasses extend, add nothing.
const baseSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } },
} as const;

class BaseRecord extends Model {
  static jsonSchema: ReadonlyJSONSchema = baseSchema;
  static relationMappings: RelationMappings = {};
}

type _general = Expect<Equal<keyof FromModel<typeof BaseRecord>, never>>;
type _inherited = Expect<Equal<keyof FromModel<typeof Model>, never>>;

// Such models derive their properties from the schema constant with
// FromJSONSchema, and their relations still with FromModel.
class Entry extends Model {
  static jsonSchema: ReadonlyJSONSchema = baseSchema;
  static relationMappings = () => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Owner,
      join: { from: 'entries.ownerId', to: 'owners.id' },
    },
  });
}

interface Entry extends FromJSONSchema<typeof baseSchema>, FromModel<typeof Entry> {}

declare const entry: Entry;
type _entry = Expect<Equal<[Entry['id'], Entry['owner']], [number, Owner | null | undefined]>>;

// Subclasses with a literal schema derive both, and inherit the mappings.
const noteSchema = {
  type: 'object',
  required: [...baseSchema.required, 'text'],
  properties: { ...baseSchema.properties, text: { type: 'string' } },
} as const;

class Note extends Entry {
  static jsonSchema = noteSchema;
}

interface Note extends FromModel<typeof Note> {}

type _note = Expect<
  Equal<[Note['id'], Note['text'], Note['owner']], [number, string, Owner | null | undefined]>
>;
