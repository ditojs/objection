// Type tests for the methods in `virtualAttributes`, which `toJSON()` calls:
// on models with FromModel, ModelJson includes their results.

import { DataPropertyNames, FromModel, Model, ModelJson, ModelObject } from 'objection';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

class Person extends Model {
  static tableName = 'persons';
  static jsonSchema = {
    type: 'object',
    required: ['firstName'],
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string' },
      age: { type: 'integer' },
    },
  } as const;

  static virtualAttributes = ['fullName', 'isAdult', 'firstPet'] as const;

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  });

  fullName() {
    return `${this.firstName}`;
  }

  get isAdult() {
    return (this.age ?? 0) >= 18;
  }

  // Models returned by virtual attributes are written as JSON.
  firstPet() {
    return this.pets?.[0];
  }

  // Methods that aren't virtual attributes stay out of the JSON.
  greet() {
    return `Hello ${this.firstName}`;
  }
}

interface Person extends FromModel<typeof Person> {}

class Pet extends Model {
  static tableName = 'pets';
  static jsonSchema = {
    type: 'object',
    properties: { name: { type: 'string' }, ownerId: { type: 'integer' } },
  } as const;

  static virtualAttributes = ['label'] as const;

  label() {
    return this.name?.toUpperCase();
  }
}

interface Pet extends FromModel<typeof Pet> {}

// Like `jsonSchema`, models that subclasses extend with more virtual
// attributes declare the general type, and the subclasses list them all.
class Base extends Model {
  static virtualAttributes: readonly string[] = ['fullName'];
  firstName?: string;

  fullName() {
    return `${this.firstName}`;
  }
}

class Employee extends Base {
  static virtualAttributes = ['fullName', 'title'] as const;

  title() {
    return 1;
  }
}

interface Employee extends FromModel<typeof Employee> {}

// A list with the general type adds nothing.
class Plain extends Model {
  static tableName = 'plain';
  static virtualAttributes = ['fullName'];
  name?: string;

  fullName() {
    return this.name;
  }
}

interface Plain extends FromModel<typeof Plain> {}

declare const person: Person;
const json = person.toJSON();

type _fullName = Expect<Equal<typeof json.fullName, string>>;
type _isAdult = Expect<Equal<typeof json.isAdult, boolean>>;
type _greet = Expect<Equal<'greet' extends keyof typeof json ? true : false, false>>;
type _pets = Expect<Equal<NonNullable<typeof json.pets>[number]['label'], string | undefined>>;
type _employee = Expect<
  Equal<[ModelJson<Employee>['title'], ModelJson<Employee>['fullName']], [number, string]>
>;
type _plain = Expect<Equal<'fullName' extends keyof ModelJson<Plain> ? true : false, false>>;

type _firstPet = Expect<Equal<typeof json.firstPet, ModelJson<Pet> | undefined>>;

// Properties starting with `~` stay data.
class Tilde extends Model {
  '~meta'?: string;
}

type _tilde = Expect<Equal<'~meta' extends DataPropertyNames<Tilde> ? 1 : 0, 1>>;

// The keys of the virtual attributes aren't data.
type _data = Expect<Equal<`~virtual:${string}` & DataPropertyNames<Person>, never>>;
type _object = Expect<Equal<'~virtual:fullName' extends keyof ModelObject<Person> ? 1 : 0, 0>>;
