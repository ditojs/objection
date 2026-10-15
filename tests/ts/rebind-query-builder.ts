// Type tests for custom query builders, which declare their type through the
// `RebindType` member.

import {
  AnyQueryBuilder,
  MaybeSingleQueryBuilder,
  Model,
  NumberQueryBuilder,
  Page,
  PageQueryBuilder,
  QueryBuilder,
  RelateQueryBuilder,
  RelationExpression,
  SingleQueryBuilder,
  WithGraphOptions,
  WithGraphQueryBuilder,
} from 'objection';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

class MyQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<M, R, X> {
  declare RebindType: MyQueryBuilder<this['~M'], this['~R'], this['~X']>;

  someCustomMethod(): this {
    return this;
  }

  whereName(name: string) {
    return this.where('name', name);
  }

  firstWithName(name: string) {
    return this.whereName(name).first();
  }
}

class BaseModel extends Model {
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}

class Animal extends BaseModel {
  static tableName = 'animals';
  id!: number;
  name!: string;
  owner?: Person;
}

class Person extends BaseModel {
  static tableName = 'persons';
  id!: number;
  name!: string;
  pets?: Animal[];
  parent?: Person;
}

declare const person: Person;

async function resultKinds() {
  const a = Person.query().someCustomMethod();
  type _a = Expect<Equal<typeof a, MyQueryBuilder<Person, Person[]>>>;

  const b = Person.query().first().someCustomMethod();
  type _b = Expect<Equal<typeof b, MyQueryBuilder<Person, Person | undefined>>>;

  const c = Person.query().findById(1).someCustomMethod();
  type _c = Expect<Equal<typeof c, MyQueryBuilder<Person, Person | undefined>>>;

  const d = Person.query().findOne({ name: 'Jennifer' }).someCustomMethod();
  type _d = Expect<Equal<typeof d, MyQueryBuilder<Person, Person | undefined>>>;

  const e = Person.query().findById(1).throwIfNotFound().someCustomMethod();
  type _e = Expect<Equal<typeof e, MyQueryBuilder<Person, Person>>>;

  const f = Person.query().someCustomMethod().throwIfNotFound();
  type _f = Expect<Equal<typeof f, MyQueryBuilder<Person, Person[]>>>;

  const g = Person.query().patch({ name: 'Jennifer' }).someCustomMethod();
  type _g = Expect<Equal<typeof g, MyQueryBuilder<Person, number>>>;

  const h = Person.query().count().someCustomMethod();
  type _h = Expect<Equal<typeof h, MyQueryBuilder<Person, Person[]>>>;

  const i = Person.query().resultSize();
  type _i = Expect<Equal<typeof i, Promise<number>>>;

  const j = Person.query().page(0, 10).someCustomMethod();
  type _j = Expect<Equal<typeof j, MyQueryBuilder<Person, Page<Person>>>>;

  const k = Person.query().range(0, 10).someCustomMethod();
  type _k = Expect<Equal<typeof k, MyQueryBuilder<Person, Page<Person>>>>;

  const l = Person.query().insert({ name: 'Jennifer' }).someCustomMethod();
  type _l = Expect<Equal<typeof l, MyQueryBuilder<Person, Person>>>;

  const m = Person.query()
    .insert([{ name: 'Jennifer' }])
    .someCustomMethod();
  type _m = Expect<Equal<typeof m, MyQueryBuilder<Person, Person[]>>>;

  const n: number = await Person.query().deleteById(1).someCustomMethod();
  const nr = Person.query().deleteById(1).someCustomMethod().returning('*');
  type _nr = Expect<Equal<typeof nr, MyQueryBuilder<Person, Person | undefined>>>;

  const o: Person | undefined = await Person.query().first().someCustomMethod();
  const p: number = await Person.query().patch({ name: 'Jennifer' });
  const q: Page<Person> = await Person.query().page(0, 10).someCustomMethod();
}

async function chainedCustomMethods() {
  const a = Person.query().whereName('Jennifer').someCustomMethod();
  type _a = Expect<Equal<typeof a, MyQueryBuilder<Person, Person[]>>>;

  const b = Person.query().firstWithName('Jennifer').someCustomMethod();
  type _b = Expect<Equal<typeof b, MyQueryBuilder<Person, Person | undefined>>>;

  const c = Person.query().patch({ name: 'Jennifer' }).firstWithName('Jennifer');
  type _c = Expect<Equal<typeof c, MyQueryBuilder<Person, number>>>;

  const d = Person.query()
    .someCustomMethod()
    .modify((qb) => qb.someCustomMethod().whereName('Jennifer'))
    .modifyGraph<Animal>('pets', (qb) => qb.someCustomMethod().whereName('Fluffy'))
    .with('someAlias', (qb) => qb.someCustomMethod().select('id'))
    .someCustomMethod();
  type _d = Expect<Equal<typeof d, MyQueryBuilder<Person, Person[]>>>;

  const e = Person.query().first().emptyInstance().someCustomMethod();
  type _e = Expect<Equal<typeof e, MyQueryBuilder<Person, Person | undefined>>>;
}

async function relatedQueries() {
  const a = person.$relatedQuery('pets').someCustomMethod();
  type _a = Expect<Equal<typeof a, MyQueryBuilder<Animal, Animal[]>>>;

  const b = person.$relatedQuery('parent').someCustomMethod();
  type _b = Expect<Equal<typeof b, MyQueryBuilder<Person, Person | undefined>>>;

  const c = Person.relatedQuery('pets').for(1).first().someCustomMethod();
  type _c = Expect<Equal<typeof c, MyQueryBuilder<Animal, Animal | undefined>>>;

  const d = person.$query().someCustomMethod();
  type _d = Expect<Equal<typeof d, MyQueryBuilder<Person, Person>>>;

  const e = person.$relatedQuery('pets').relate(1).someCustomMethod();
  type _e = Expect<Equal<typeof e, RelateQueryBuilder<MyQueryBuilder<Animal, number>>>>;
}

async function withGraphNarrowing() {
  const a = Person.query().withGraphFetched('pets.owner').someCustomMethod();
  const qb: MyQueryBuilder<Person, Person[]> = a;
  const as = await a;
  as[0].pets[0].owner.name;
  // @ts-expect-error
  as[0].parent.name;

  const b = await Person.query()
    .withGraphJoined('parent')
    .findById(1)
    .someCustomMethod()
    .throwIfNotFound()
    .someCustomMethod();
  b.parent.name;
  type _b = Expect<Equal<undefined extends typeof b ? true : false, false>>;

  const c = await Person.query().first().withGraphFetched('pets').someCustomMethod();
  c?.pets.length;

  const d = await Person.query().withGraphFetched('pets').page(0, 10).someCustomMethod();
  d.results[0].pets.length;

  const e = await Person.relatedQuery('pets').for(1).withGraphFetched('owner').someCustomMethod();
  e[0].owner.name;
}

// The plain query builder still rebinds to itself.
class PlainModel extends Model {
  id!: number;
}

const plainFirst = PlainModel.query().first();
type _plainFirst = Expect<
  Equal<typeof plainFirst, QueryBuilder<PlainModel, PlainModel | undefined>>
>;
const plainPage = PlainModel.query().page(0, 10);
type _plainPage = Expect<Equal<typeof plainPage, QueryBuilder<PlainModel, Page<PlainModel>>>>;

// Custom query builders that extend other custom query builders.
class MyOtherQueryBuilder<M extends Model, R = M[], X = unknown> extends MyQueryBuilder<M, R, X> {
  declare RebindType: MyOtherQueryBuilder<this['~M'], this['~R'], this['~X']>;

  otherCustomMethod(): this {
    return this;
  }
}

class OtherModel extends Model {
  static QueryBuilder = MyOtherQueryBuilder;
  declare QueryBuilderType: MyOtherQueryBuilder<this>;
  id!: number;
  name!: string;
}

const other = OtherModel.query().first().someCustomMethod().otherCustomMethod();
type _other = Expect<Equal<typeof other, MyOtherQueryBuilder<OtherModel, OtherModel | undefined>>>;

// Without the `RebindType` declaration, the custom methods are lost.
class ForgetfulQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<M, R, X> {
  someCustomMethod(): this {
    return this;
  }
}

class ForgetfulModel extends Model {
  static QueryBuilder = ForgetfulQueryBuilder;
  declare QueryBuilderType: ForgetfulQueryBuilder<this>;
  id!: number;
}

ForgetfulModel.query().someCustomMethod();
// @ts-expect-error
ForgetfulModel.query().first().someCustomMethod();

async function expectErrors() {
  // @ts-expect-error first() may return undefined
  const a: Person = await Person.query().first().someCustomMethod();
  // @ts-expect-error the result kind is a number
  const b: Person[] = await Person.query().patch({ name: 'Jennifer' }).someCustomMethod();
  // @ts-expect-error not a custom method
  Person.query().first().someOtherMethod();
  // @ts-expect-error the custom methods of MyOtherQueryBuilder are not on MyQueryBuilder
  Person.query().first().otherCustomMethod();
  // @ts-expect-error a page is not an array
  const c: Person[] = await Person.query().page(0, 10).someCustomMethod();
}

// Query builders that override methods with the helper types as return types.
class OverridingQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<M, R, X> {
  declare RebindType: OverridingQueryBuilder<this['~M'], this['~R'], this['~X']>;

  withGraph<const E extends RelationExpression<M>>(
    expr: E,
    options?: WithGraphOptions,
  ): WithGraphQueryBuilder<this, E> {
    return super.withGraph(expr, options);
  }

  someCustomMethod(): this {
    return this;
  }

  findById(id: number): MaybeSingleQueryBuilder<this> {
    return super.findById(id);
  }

  patchAndFetch(data: object): SingleQueryBuilder<this> {
    return super.patchAndFetch(data);
  }

  delete(): NumberQueryBuilder<this> {
    return super.delete();
  }

  page(page: number, pageSize: number): PageQueryBuilder<this> {
    return super.page(page, pageSize);
  }

  firstAny() {
    const query: AnyQueryBuilder = this;
    return this.first();
  }
}

class OverridingModel extends Model {
  static QueryBuilder = OverridingQueryBuilder;
  declare QueryBuilderType: OverridingQueryBuilder<this>;
  id!: number;
  name!: string;
  parent?: OverridingModel;
}

async function overridingQueryBuilders() {
  type OM = OverridingModel;
  const a = OverridingModel.query().first().someCustomMethod();
  type _a = Expect<Equal<typeof a, OverridingQueryBuilder<OM, OM | undefined>>>;
  const b = OverridingModel.query().firstAny().someCustomMethod();
  type _b = Expect<Equal<typeof b, OverridingQueryBuilder<OM, OM | undefined>>>;
  const c = await OverridingModel.query().withGraph('parent').findById(1).someCustomMethod();
  c?.parent.name;
  const d: AnyQueryBuilder = OverridingModel.query().page(0, 10);
}

// The helper types are what the methods return.
function helperTypes(query: MyQueryBuilder<Person>) {
  const a = query.first();
  type _a = Expect<Equal<typeof a, MaybeSingleQueryBuilder<MyQueryBuilder<Person>>>>;
  const b = query.findById(1).throwIfNotFound();
  type _b = Expect<Equal<typeof b, SingleQueryBuilder<MyQueryBuilder<Person>>>>;
  const c = query.patch({ name: 'Jennifer' });
  type _c = Expect<Equal<typeof c, NumberQueryBuilder<MyQueryBuilder<Person>>>>;
  const d = query.page(0, 10);
  type _d = Expect<Equal<typeof d, PageQueryBuilder<MyQueryBuilder<Person>>>>;
  const e = query.withGraphFetched('pets');
  type _e = Expect<Equal<typeof e, WithGraphQueryBuilder<MyQueryBuilder<Person>, 'pets'>>>;
}

// fetchGraph() keeps the custom query builder.
async function fetchGraph() {
  const a = Person.fetchGraph(person, 'pets').someCustomMethod();
  (await a).pets.length;
  const b = Person.fetchGraph([person], 'parent').someCustomMethod();
  (await b)[0].parent.name;
  const c = person.$fetchGraph('pets.owner').someCustomMethod();
  (await c).pets[0].owner.name;
}

// The five `*QueryBuilderType` members of 3.x are gone.
// @ts-expect-error
type _single = MyQueryBuilder<Person>['SingleQueryBuilderType'];

// Inside the methods of a custom query builder, where `this` is generic, the
// methods that change the result kind keep the model and result types.
class GenericThisQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<M, R, X> {
  declare RebindType: GenericThisQueryBuilder<this['~M'], this['~R'], this['~X']>;

  custom(): this {
    return this;
  }

  async methods() {
    const a = await this.patch({});
    const n: number = a;
    // @ts-expect-error
    a.foo;
    const b: GenericThisQueryBuilder<M, M | undefined> = this.findById(1).custom();
    // @ts-expect-error
    const c: number = this.findById(1);
    const d: Page<M> = await this.page(0, 10);
    const e: M = await this.insert({});
    // The result kind of writes with returning() depends on R, which
    // TypeScript can't resolve here.
    const f: M[] | M | undefined = await this.patch({}).returning('*');
    const g: M[] | M | undefined = await this.delete().returning('*');
    const h: M[] | M | undefined = await this.update({}).returning('id');
    const i: M[] | M | undefined = await this.deleteById(1).returning('*').custom();
    const j: M[] | M | undefined = await this.findById(1).patch({}).returning('*');
  }
}
