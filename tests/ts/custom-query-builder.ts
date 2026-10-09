import { Model, QueryBuilder, Page, TransactionOrKnex } from '../../';

class CustomQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare ArrayQueryBuilderType: CustomQueryBuilder<M, M[]>;
  declare SingleQueryBuilderType: CustomQueryBuilder<M, M>;
  declare MaybeSingleQueryBuilderType: CustomQueryBuilder<M, M | undefined>;
  declare NumberQueryBuilderType: CustomQueryBuilder<M, number>;
  declare PageQueryBuilderType: CustomQueryBuilder<M, Page<M>>;

  someCustomMethod(): this {
    return this;
  }

  delete() {
    return super.delete();
  }
}

class BaseModel extends Model {
  declare QueryBuilderType: CustomQueryBuilder<this>;

  $query(trxOrKnex?: TransactionOrKnex) {
    return super.$query(trxOrKnex);
  }
}

class Animal extends BaseModel {
  id!: number;
  name!: string;
  owner!: Person;
}

class Person extends BaseModel {
  firstName!: string;
  pets!: Animal[];
}

const people: CustomQueryBuilder<Person, Person[]> = Person.query()
  .someCustomMethod()
  .where('firstName', 'lol')
  .someCustomMethod()
  .with('someAlias', (qb) => qb.someCustomMethod().from('lol').select('id'))
  .modifyGraph<Animal>('pets', (qb) => qb.someCustomMethod().where('id', 1).someCustomMethod());

const pets: CustomQueryBuilder<Animal, Animal | undefined> = new Person()
  .$relatedQuery('pets')
  .someCustomMethod()
  .where('id', 1)
  .first()
  .someCustomMethod();

const emptyPeople: CustomQueryBuilder<Person, Person[]> = Person.query()
  .someCustomMethod()
  .where('firstName', 'lol')
  .emptyInstance()
  .someCustomMethod();

const numUpdated: CustomQueryBuilder<Person, number> = Person.query()
  .someCustomMethod()
  .patch({ firstName: 'test' })
  .someCustomMethod();

const allPets: PromiseLike<Animal[]> = Person.relatedQuery('pets')
  .for(Person.query().select('id'))
  .someCustomMethod();

// throwIfNotFound keeps the custom query builder type.
const throwIfNotFound: CustomQueryBuilder<Person, Person> = Person.query()
  .findById(1)
  .throwIfNotFound()
  .someCustomMethod();
