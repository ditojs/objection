import { Person } from '../../fixtures/person.js';
import { Animal } from '../../fixtures/animal.js';

type IPerson = Partial<
  Pick<Person, 'id' | 'firstName' | 'lastName'> & {
    pets: Partial<Pick<Animal, 'id' | 'name'>>[];
  }
>;

(async () => {
  const jennifer = await Person.query().insert({
    firstName: 'Jennifer',
    lastName: 'Lawrence',
  });

  const personPromise: PromiseLike<Person> = Person.fromJson({ firstName: 'Jennifer' })
    .$query()
    .insert();

  const jenniferObj: IPerson = {
    firstName: 'Jennifer',
    lastName: 'Lawrence',
  };
  await Person.query().insert(jenniferObj);
  await Person.query().insert([jenniferObj]);

  // Nested relation data can be plain objects...
  await Person.query().insert({
    firstName: 'Jennifer',
    mom: { firstName: 'Karen' },
    children: [{ firstName: 'Jane' }],
    pets: [{ name: 'Fluffy' }],
  });

  // ...or model instances.
  await Person.query().insert({
    firstName: 'Jennifer',
    mom: Person.fromJson({ firstName: 'Karen' }),
    pets: [Animal.fromJson({ name: 'Fluffy' })],
  });

  // Nested relation data is still type checked.
  // @ts-expect-error firstName must be a string
  await Person.query().insert({ mom: { firstName: 1 } });
  // @ts-expect-error unknown property in nested relation data
  await Person.query().insert({ mom: { notAProperty: 'foo' } });
  // @ts-expect-error name must be a string
  await Person.query().insert({ pets: [{ name: 1 }] });
  // @ts-expect-error pets must be an array
  await Person.query().insert({ pets: { name: 'Fluffy' } });

  const wrongPetObj: { pets: { name: number }[] } = { pets: [{ name: 1 }] };
  // @ts-expect-error name of pets must be a string
  await Person.query().insert(wrongPetObj);
})();
