import {
  MaybeCompositeId,
  Model,
  ModelConstructor,
  NumberQueryBuilder,
  PartialModelObject,
  QueryBuilder,
  Page,
  RelateQueryBuilder,
  RelationExpression,
  TransactionOrKnex,
  WithGraphOptions,
  WithGraphQueryBuilder,
} from 'objection';

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

  // Custom query builders can override withGraph() with its narrowed return type.
  withGraph<const E extends RelationExpression<M>>(
    expr: E,
    options?: WithGraphOptions,
  ): WithGraphQueryBuilder<this, E> {
    return super.withGraph(expr, options);
  }

  // relate() can be overridden with an inferred return type...
  relate(
    ids: MaybeCompositeId | MaybeCompositeId[] | PartialModelObject<M> | PartialModelObject<M>[],
  ) {
    return super.relate(ids);
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

  // ...and with an explicit one, in a model's `static QueryBuilder`.
  relate(
    ids: MaybeCompositeId | MaybeCompositeId[] | PartialModelObject<M> | PartialModelObject<M>[],
  ): RelateQueryBuilder<NumberQueryBuilder<this>> {
    return super.relate(ids);
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

// The withGraph() override keeps the custom query builder.
const peopleWithPets: CustomQueryBuilder<Person, Person[]> = Person.query()
  .withGraph('pets')
  .someCustomMethod();

// relate() keeps the custom query builder, also with returning().
const numRelatedPets: CustomQueryBuilder<Animal, number> = Person.relatedQuery('pets')
  .for(1)
  .relate(2)
  .someCustomMethod();
const relatedPetRows: PromiseLike<any[]> = Person.relatedQuery('pets')
  .for(1)
  .relate(2)
  .someCustomMethod()
  .returning('*');

// TypeScript 7, and 5.x depending on the order of checks, relates the
// withGraph() override to the base method for a generic model, so check that
// directly.
function withGraphOverride<M extends Model>(
  withGraph: CustomQueryBuilder<M, number>['withGraph'],
): QueryBuilder<M, number>['withGraph'] {
  return withGraph;
}

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The exact result types of the methods that are typed through `this`.
function resultTypes() {
  const relate = Person.relatedQuery('pets').for(1).relate(2).someCustomMethod().relate(3);
  type _relate = Expect<
    Equal<typeof relate, RelateQueryBuilder<CustomQueryBuilder<Animal, number>>>
  >;
  const relateReturning = Person.relatedQuery('pets').for(1).relate(2).debug().returning('*');
  type _relateReturning = Expect<Equal<typeof relateReturning, QueryBuilder<Animal, any[]>>>;
  const first = Person.query().someCustomMethod().first();
  type _first = Expect<Equal<typeof first, CustomQueryBuilder<Person, Person | undefined>>>;
  const insertGraph = Person.query().insertGraph({ firstName: 'Jennifer' });
  type _insertGraph = Expect<Equal<typeof insertGraph, CustomQueryBuilder<Person, Person>>>;
  const insertGraphs = Person.query().insertGraph([{ firstName: 'Jennifer' }]);
  type _insertGraphs = Expect<Equal<typeof insertGraphs, CustomQueryBuilder<Person, Person[]>>>;
  const upsertGraph = Person.query().upsertGraph({ firstName: 'Jennifer' });
  type _upsertGraph = Expect<Equal<typeof upsertGraph, CustomQueryBuilder<Person, Person>>>;
  const patchReturning = Person.query().patch({ firstName: 'Jennifer' }).returning('*');
  type _patchReturning = Expect<Equal<typeof patchReturning, CustomQueryBuilder<Person, Person[]>>>;
  const where = Person.query().where({ firstName: 'Jennifer' });
  type _where = Expect<Equal<typeof where, CustomQueryBuilder<Person, Person[]>>>;
}

// Query builders of subclasses and their result kinds stay assignable to the
// base types, and not the other way around.
const toBaseModel: QueryBuilder<Model> = Person.query();
const toBaseQueryBuilder: QueryBuilder<Person> = Person.query();
const toBaseModelNumber: QueryBuilder<Model, number> = Person.query().patch({});
const toMaybeSingle: QueryBuilder<Person, Person | undefined> = Person.query().findById(1);
// @ts-expect-error the base model's query builder isn't a Person query builder
const fromBaseModel: QueryBuilder<Person> = new QueryBuilder(Model);
// @ts-expect-error a number result isn't an array result
const fromNumber: QueryBuilder<Person> = Person.query().patch({});
