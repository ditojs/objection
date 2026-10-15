// Type tests for modifier names in strict mode: unknown modifiers of the
// model classes that start the queries are rejected.

import {
  ConstructorType,
  FromModel,
  Model,
  Modifiers,
  QueryBuilder,
  QueryBuilderType,
  RelationMappings,
  TransactionOrKnex,
} from 'objection';

class Owner extends Model {
  static tableName = 'owners';
  static jsonSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      age: { type: 'integer' },
    },
  } as const;

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: () => Pet,
      join: { from: 'owners.id', to: 'pets.ownerId' },
    },
  });

  static modifiers = {
    orderByName(query: QueryBuilder<Owner>) {
      query.orderBy('name');
    },
    olderThan(query: QueryBuilder<Owner>, age: number) {
      query.where('age', '>', age);
    },
  };

  // Queries started from instances aren't checked.
  orderedQuery() {
    return this.$query().modify('orderByName');
  }

  dogsGraphQuery() {
    return this.$query().withGraphFetched('pets(onlyDogs)').modify('orderByName');
  }

  firstPet() {
    return this.$relatedQuery('pets').first();
  }

  dogsQuery() {
    return this.$relatedQuery('pets')
      .modifiers({ latest: (query) => query })
      .modify('latest');
  }
}

interface Owner extends FromModel<typeof Owner> {}

class Pet extends Model {
  static tableName = 'pets';
  static jsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      species: { type: 'string' },
      ownerId: { type: 'integer' },
    },
  } as const;

  static relationMappings = () => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Owner,
      join: { from: 'pets.ownerId', to: 'owners.id' },
    },
  });

  static get modifiers() {
    return {
      onlyDogs(query: QueryBuilder<Pet>) {
        query.where('species', 'dog');
      },
    };
  }
}

interface Pet extends FromModel<typeof Pet> {}

// Models whose modifiers have the general type aren't checked, e.g. as their
// `modifierNotFound()` handles any name.
class Toy extends Model {
  static tableName = 'toys';
  static modifiers: Modifiers = {};
}

// Subclasses check their own modifiers and the inherited ones.
class Dog extends Pet {
  static get modifiers() {
    return {
      ...super.modifiers,
      puppies(query: QueryBuilder<Dog>) {
        query.where('species', 'puppy');
      },
    };
  }
}

interface Dog extends FromModel<typeof Dog> {}

// Relations with mappings of the general type aren't checked.
class Shelter extends Model {
  static tableName = 'shelters';
  name!: string;
  pets?: Pet[];

  static relationMappings: RelationMappings = {};
}

// Models that override `query()` declare `this` as `ConstructorType`, and
// aren't checked.
class Scoped extends Model {
  static tableName = 'scoped';
  name!: string;

  static modifiers = {
    orderByName(query: QueryBuilder<Scoped>) {
      query.orderBy('name');
    },
  };

  static query<M extends Model>(this: ConstructorType<M>, trx?: TransactionOrKnex) {
    return super.query(trx) as QueryBuilderType<M>;
  }
}

// Models without FromModel are checked too.
class Plain extends Model {
  static tableName = 'plain';
  name!: string;

  static modifiers = {
    orderByName(query: QueryBuilder<Plain>) {
      query.orderBy('name');
    },
  };
}

async function modify() {
  await Owner.query().modify('orderByName');
  await Owner.query().modify('olderThan', 30);
  // @ts-expect-error
  await Owner.query().modify('orderByNme');
  // @ts-expect-error a modifier of the related model
  await Owner.query().modify('onlyDogs');
  // The arguments aren't checked.
  await Owner.query().modify('olderThan', 'thirty');

  // Names are checked in lists too, functions aren't.
  const byName = (query: QueryBuilder<Owner>) => query.where('name', 'x');
  await Owner.query().modify((query) => query.where('name', 'x'));
  await Owner.query().modify(['orderByName', 'olderThan'], 30);
  await Owner.query().modify([byName, 'orderByName', ['olderThan']], 30);
  // @ts-expect-error
  await Owner.query().modify([byName, ['olderThn']]);
  // @ts-expect-error
  await Owner.query().modify(['orderByName', 'olderThn']);

  // Names in variables are typed as names of the modifiers.
  const name: keyof typeof Owner.modifiers = 'orderByName';
  await Owner.query().modify(name);
  const anyName: string = 'orderByName';
  // @ts-expect-error
  await Owner.query().modify(anyName);
  await Toy.query().modify('anything');
  await Scoped.query().modify('anything');

  await Dog.query().modify('puppies').modify('onlyDogs');
  // @ts-expect-error
  await Dog.query().modify('kittens');
  await Plain.query().modify('orderByName');
  // @ts-expect-error
  await Plain.query().modify('orderByNme');

  // Explicit type arguments leave the class out, which isn't checked then.
  await Owner.query<Owner>().modify('anything');
  await Owner.relatedQuery<Owner, 'pets'>('pets').modify('anything');

  // castTo() keeps the registered modifiers.
  const latest = (query: QueryBuilder<Owner>) => query;
  // @ts-expect-error
  await Owner.query().modifiers({ latest }).castTo<Pet>().modify('latst');

  // relatedQuery() checks the modifiers of the related class.
  await Owner.relatedQuery('pets').for(1).modify('onlyDogs');
  // @ts-expect-error
  await Owner.relatedQuery('pets').for(1).modify('orderByName');

  // Queries started from instances aren't checked.
  const owner = await Owner.query().findById(1).throwIfNotFound();
  await owner.$query().modify('anything');
  await owner.$relatedQuery('pets').modify('anything');
}

async function registered() {
  const latest = (query: QueryBuilder<Owner>) => query.orderBy('name', 'desc').limit(3);
  await Owner.query().modifiers({ latest }).modify('latest');
  await Owner.query()
    .modifiers({ byAge: (query, age: number) => query.where('age', age) })
    .modify('byAge', 3);
  // Registered names stay through the chain and add up.
  await Owner.query()
    .modifiers({ latest })
    .where('name', 'x')
    .modifiers({ first: (query) => query.limit(1) })
    .modify('latest')
    .modify('first');
  // Registered names stay when the result kind changes.
  await Owner.query().modifiers({ latest }).findById(1).modify('latest');
  await Owner.query().modifiers({ latest }).first().withGraphFetched('pets.owner(latest)');
  await Owner.query().modifiers({ latest }).select('name').modify('latest');
  await Owner.query().modifiers({ latest }).page(0, 10).modify('latest');
  await Owner.query().modifiers({ latest }).patch({ name: 'x' }).modify('latest');
  await Owner.query().modifiers({ latest }).withGraphFetched('pets').first().modify('latest');
  // @ts-expect-error registered after modify()
  await Owner.query().modify('latest').modifiers({ latest });
}

async function relationExpressions() {
  await Owner.query().withGraphFetched('pets(onlyDogs)');
  await Owner.query().withGraphFetched('pets(onlyDogs).owner(orderByName, olderThan)');
  await Owner.query().withGraphJoined('[pets(onlyDogs), pets.owner]');
  await Owner.query().joinRelated('pets(onlyDogs)');
  await Owner.query().withGraphFetched({ pets: { $modify: ['onlyDogs'], owner: true } });
  // @ts-expect-error
  await Owner.query().withGraphFetched('pets(onlyDgs)');
  // @ts-expect-error a modifier of the owner, not of the pets
  await Owner.query().withGraphFetched('pets(orderByName)');
  // @ts-expect-error
  await Owner.query().withGraphFetched('[pets.owner(orderByNme)]');
  // @ts-expect-error
  await Owner.query().joinRelated('pets(onlyDgs)');
  // @ts-expect-error a relation named twice in a list
  await Owner.query().withGraphFetched('[pets(onlyDgs), pets.owner]');
  // @ts-expect-error
  await Owner.query().withGraphFetched('[pets.owner, pets(onlyDgs)]');
  // @ts-expect-error
  await Owner.query().withGraphFetched({ pets: { $modify: ['onlyDgs'] } });

  // Relations with modifiers are narrowed as usual.
  const owners = await Owner.query().withGraphFetched('pets(onlyDogs).owner(orderByName)');
  owners[0].pets[0].owner?.name;
  const objects = await Owner.query().withGraphFetched({ pets: { $modify: ['onlyDogs'] } });
  objects[0].pets[0].name;

  // Modifiers registered before the graph method are known to it.
  const latest = (query: QueryBuilder<Pet>) => query.orderBy('name', 'desc').limit(3);
  await Owner.query().modifiers({ latest }).withGraphFetched('pets(latest)');
  await Owner.query()
    .modifiers({ latest })
    .withGraphFetched('pets(latest)')
    .withGraphFetched('pets(latest)');
  // @ts-expect-error registered after the graph method
  await Owner.query().withGraphFetched('pets(latest)').modifiers({ latest });

  await Shelter.query().withGraphFetched('pets(anything)');

  // Empty arguments are no names.
  await Owner.query().withGraphFetched('pets()');
  await Owner.query().withGraphFetched('pets(onlyDogs, )');

  // Expressions that can't be resolved aren't checked.
  const expr: string = 'pets(onlyDgs)';
  await Owner.query().withGraphFetched(expr);
}

// Custom query builders keep the context through their `RebindType`, and
// queries in their methods, which are generic, aren't checked.
class KennelQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<M, R, X> {
  declare RebindType: KennelQueryBuilder<this['~M'], this['~R'], this['~X']>;

  ordered() {
    return this.modify('anything');
  }
}

class Kennel extends Model {
  static tableName = 'kennels';
  name!: string;

  declare QueryBuilderType: KennelQueryBuilder<this>;
  static QueryBuilder = KennelQueryBuilder;

  static modifiers = {
    orderByName(query: QueryBuilder<Kennel>) {
      query.orderBy('name');
    },
  };
}

async function customQueryBuilders() {
  await Kennel.query().ordered().first().modify('orderByName').ordered();
  // @ts-expect-error
  await Kennel.query().ordered().first().modify('orderByNme');
  // @ts-expect-error
  await Kennel.query().select('name').page(0, 10).modify('orderByNme');
}

function generic<M extends Model>(query: QueryBuilder<M>) {
  query.modify('anything', 1);
  return query.modifiers({ latest: (query) => query }).modify('latest');
}

// Declaration files name the registered modifiers:
export const registeredQuery = Owner.query()
  .modifiers({ latest: (query: QueryBuilder<Owner>) => query })
  .first();
