import { Person } from '../fixtures/person.js';
import { Animal } from '../fixtures/animal.js';
import { Model, ModelJson } from 'objection';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const takesPersonJson = (person: ModelJson<Person>) => true;

const person = Person.fromJson({ firstName: 'Jennifer' });
const personJson = person.toJSON();

takesPersonJson(personJson);
takesPersonJson(person.$toJson());

// The JSON has the properties, and the related models as JSON too.
type _firstName = Expect<Equal<(typeof personJson)['firstName'], string | undefined>>;
type _pets = Expect<Equal<(typeof personJson)['pets'], ModelJson<Animal>[]>>;
type _owner = Expect<
  Equal<(typeof personJson)['pets'][number]['owner'], ModelJson<Person> | undefined>
>;
// @ts-expect-error methods aren't part of the JSON
personJson.examplePersonMethod;
// @ts-expect-error neither are the methods of related models
personJson.pets[0].$query;

// Columns typed `any` or `any[]` aren't relations, and readonly relations
// stay readonly.
class Tagged extends Model {
  meta?: any;
  tags!: any[];
  friends!: readonly Person[];
}

const taggedJson = new Tagged().toJSON();
type _meta = Expect<Equal<(typeof taggedJson)['meta'], any>>;
type _tags = Expect<Equal<(typeof taggedJson)['tags'], any[]>>;
type _friends = Expect<Equal<(typeof taggedJson)['friends'], readonly ModelJson<Person>[]>>;
