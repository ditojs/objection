import { Model, ModelConstructor, QueryBuilder, Page, TransactionOrKnex } from 'objection';

class CustomQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare ArrayQueryBuilderType: CustomQueryBuilder<M, M[]>;
  declare SingleQueryBuilderType: CustomQueryBuilder<M, M>;
  declare MaybeSingleQueryBuilderType: CustomQueryBuilder<M, M | undefined>;
  declare NumberQueryBuilderType: CustomQueryBuilder<M, number>;
  declare PageQueryBuilderType: CustomQueryBuilder<M, Page<M>>;

  someCustomMethod(): this {
    return this;
  }

  // Calling first() on the polymorphic `this` type used to cause
  // "Type instantiation is excessively deep and possibly infinite".
  firstWithName(name: string) {
    return this.where('name', name).first();
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

// Custom query builders can define their own constructor and call `super()`
// with the model class, see #2306.
class DefaultSchemaQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare ArrayQueryBuilderType: DefaultSchemaQueryBuilder<M, M[]>;
  declare SingleQueryBuilderType: DefaultSchemaQueryBuilder<M, M>;
  declare MaybeSingleQueryBuilderType: DefaultSchemaQueryBuilder<M, M | undefined>;
  declare NumberQueryBuilderType: DefaultSchemaQueryBuilder<M, number>;
  declare PageQueryBuilderType: DefaultSchemaQueryBuilder<M, Page<M>>;

  constructor(modelClass: ModelConstructor<M>) {
    super(modelClass);
    this.withSchema('someSchema');
  }
}

class DefaultSchemaModel extends Model {
  static QueryBuilder = DefaultSchemaQueryBuilder;
  declare QueryBuilderType: DefaultSchemaQueryBuilder<this>;
}

class Movie extends DefaultSchemaModel {
  id!: number;
  title!: string;
}

const movies: DefaultSchemaQueryBuilder<Movie, Movie[]> = Movie.query().where('title', 'lol');
const movieQuery: QueryBuilder<Movie> = new QueryBuilder(Movie);
const defaultSchemaMovieQuery: DefaultSchemaQueryBuilder<Movie> = new DefaultSchemaQueryBuilder(
  Movie,
);

// first() inside custom query builder methods.
const firstWithName: CustomQueryBuilder<Person, Person | undefined> =
  Person.query().firstWithName('Jennifer');
const firstWithNameResult: PromiseLike<Person | undefined> = Person.query()
  .firstWithName('Jennifer')
  .someCustomMethod();
const patchFirstWithName: CustomQueryBuilder<Person, number> = Person.query()
  .patch({ firstName: 'test' })
  .firstWithName('Jennifer');
// @ts-expect-error first() may return undefined
const firstWithNameNotUndefined: PromiseLike<Person> = Person.query().firstWithName('Jennifer');
