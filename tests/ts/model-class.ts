import { Person } from './fixtures/person';
import { Animal } from './fixtures/animal';
import { Model, ModelClass } from '../../';

(async () => {
  const query = Person.query();
  const modelClass = query.modelClass();

  const persons: Person[] = await modelClass.query();
  const pets: Animal[] = await modelClass.relatedQuery('pets');
})();

(async () => {
  const modelClass: ModelClass<Person> = Person;

  const tableName: string = modelClass.tableName;
  const persons = await modelClass.query().where('firstName', 'Jennifer');
  const persons2: Person[] = await modelClass.fetchGraph(persons, 'pets');
})();

// Static methods work on model classes with constructor arguments and on
// subclasses of abstract model classes.
(async () => {
  class Base extends Model {
    constructor(public base: string) {
      super();
    }
  }

  abstract class AbstractBase extends Model {
    name?: string;
  }

  class Concrete extends AbstractBase {}

  const bases: Base[] = await Base.query();
  const base: Base = Base.fromJson({});
  const baseFromDb: Base = Base.fromDatabaseJson({});
  const fetched: Base = await Base.fetchGraph(base, 'relation');
  const fetchedArray: Base[] = await Base.fetchGraph([base], 'relation');

  const concretes: Concrete[] = await Concrete.query();
  const concrete: Concrete = Concrete.fromJson({});
})();
