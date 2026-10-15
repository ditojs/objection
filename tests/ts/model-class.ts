import { Person } from './fixtures/person.js';
import { Animal } from './fixtures/animal.js';
import { Model, ModelClass, StaticHookArguments, asArray } from 'objection';

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
  // Model classes have the statics of `Model`:
  const transacted: number = await modelClass.transaction(undefined, async () => 1);
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

// idColumn can be null (no primary key), and idColumn and jsonAttributes
// can be readonly arrays.
(async () => {
  class JoinTable extends Model {
    static tableName = 'join_table';
    static idColumn = null;
  }

  class CompositeKey extends Model {
    static tableName = 'composite_key';
    static idColumn = ['a', 'b'] as const;
    static jsonAttributes = ['data'] as const;
  }

  class GetterKey extends Model {
    static get idColumn() {
      return null;
    }
  }

  await JoinTable.query();
  await CompositeKey.query().returning(CompositeKey.idColumn);
  await CompositeKey.query().returning(['a', 'b'] as const);
})();

// The `result` of the static hooks has the shape of what the query returns,
// and is `undefined` in the before hooks.
(() => {
  class Hooked extends Model {
    static beforeFind({ result }: StaticHookArguments<Hooked>) {
      const value: undefined = result;
    }

    static afterFind({ result }: StaticHookArguments<Hooked, Model | Model[] | undefined>) {
      const models: Model[] = asArray(result);
      // @ts-expect-error `result` isn't always an array.
      result.map((model) => model);
    }

    static beforeInsert({ result }: StaticHookArguments<Hooked>) {
      const value: undefined = result;
    }

    // Overrides may narrow `result` down to what their queries return.
    static afterInsert({ result }: StaticHookArguments<Hooked, Hooked[]>) {
      const models: Hooked[] = result;
    }

    static afterUpdate({
      result,
    }: StaticHookArguments<Hooked, number | Model | Model[] | undefined>) {
      const count: number = typeof result === 'number' ? result : asArray(result).length;
    }

    static afterDelete({
      result,
    }: StaticHookArguments<Hooked, number | Model | Model[] | undefined>) {
      // @ts-expect-error `result` isn't always a number.
      const count: number = result;
    }
  }

  const numbers: number[] = asArray(1);
  const sameNumbers: number[] = asArray([1, 2]);
  const noNumbers: number[] = asArray(undefined as number | undefined);
  const nullable: (number | null)[] = asArray(null as number | null);
})();
