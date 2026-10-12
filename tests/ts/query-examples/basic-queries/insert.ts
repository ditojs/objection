import { Person } from '../../fixtures/person.js';
import { Animal } from '../../fixtures/animal.js';

type IPerson = Partial<Pick<Person, 'id' | 'firstName' | 'lastName'>>;

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

  // Model instances work too.
  await Person.query().insert(Person.fromJson({ firstName: 'Jennifer' }));

  // insert() doesn't write relations, so relation data is rejected, as plain
  // objects...
  // @ts-expect-error
  await Person.query().insert({ firstName: 'Jennifer', mom: { firstName: 'Karen' } });

  // ...and as model instances. insertGraph() takes them.
  const withPets = { firstName: 'Jennifer', pets: [Animal.fromJson({ name: 'Fluffy' })] };
  // @ts-expect-error
  await Person.query().insert(withPets);
  await Person.query().insertGraph({
    firstName: 'Jennifer',
    mom: Person.fromJson({ firstName: 'Karen' }),
    pets: [{ name: 'Fluffy' }],
  });

  // @ts-expect-error firstName must be a string
  await Person.query().insert({ firstName: 1 });
  // @ts-expect-error unknown property
  await Person.query().insert({ notAProperty: 'foo' });
})();
