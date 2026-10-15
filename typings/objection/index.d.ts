/// <reference types="node" />

// Type definitions for Objection.js
// Project: <https://ditojs.github.io/objection/>
//
// Contributions by:
// * Matthew McEachen <https://github.com/mceachen>
// * Sami Koskimäki <https://github.com/koskimas>
// * Mikael Lepistö <https://github.com/elhigu>
// * Joseph T Lapp <https://github.com/jtlapp>
// * Drew R. <https://github.com/drew-r>
// * Karl Blomster <https://github.com/kblomster>
// * And many others: See <https://github.com/Vincit/objection.js/blob/main/typings/objection/index.d.ts>

import { Ajv, Options as AjvOptions } from 'ajv';
import { Knex } from 'knex';

// Only the declarations marked with `export` are exported.
export {};

// Phantom brand of the relation types, used by `TypedRelationMappings` and
// `FromModel`.
declare const relationKind: unique symbol;
// Phantom brand of `Generated` properties.
declare const generated: unique symbol;
// Phantom brand of the rows narrowed by `select()`, holding their SQL aliases.
declare const selected: unique symbol;
// Phantom brand of the rows with `jsonExtract()` aliases.
declare const extracted: unique symbol;

export const raw: RawFunction;
export const val: ValueFunction;
export const ref: ReferenceFunction;
export const fn: FunctionFunction;

export const compose: ComposeFunction;
export const mixin: MixinFunction;

export const asArray: AsArrayFunction;

export const snakeCaseMappers: SnakeCaseMappersFactory;
export const knexSnakeCaseMappers: KnexSnakeCaseMappersFactory;
export const knexIdentifierMapping: KnexIdentifierMappingFactory;

export const transaction: transaction;
export const initialize: initialize;

// Database errors, vendored from the db-errors library.
export class DBError extends Error {
  name: string;
  nativeError: Error;
}

export class CheckViolationError extends DBError {
  table: string;
  constraint: string;
}

export class ConstraintViolationError extends DBError {}

export class DataError extends DBError {}

export class ForeignKeyViolationError extends ConstraintViolationError {
  table: string;
  constraint: string;
  schema?: string;
}

export class NotNullViolationError extends ConstraintViolationError {
  table: string;
  column: string;
  database?: string;
  schema?: string;
}

export class UniqueViolationError extends ConstraintViolationError {
  table: string;
  columns: string[];
  constraint: string;
  schema?: string;
}

export interface RawBuilder extends Aliasable {}

export interface RawFunction extends RawInterface<RawBuilder> {}
export interface RawInterface<R> {
  (sql: string, ...bindings: any[]): R;
}

export interface ValueBuilder extends Castable {}
export interface ValueFunction {
  (
    value: PrimitiveValue | PrimitiveValue[] | PrimitiveValueObject | PrimitiveValueObject[],
  ): ValueBuilder;
}

export interface ReferenceBuilder extends Castable {
  from(tableReference: string): this;
}
export interface ReferenceFunction {
  (expression: string): ReferenceBuilder;
}

export interface FunctionBuilder extends Castable {}
export interface SqlFunctionShortcut {
  (...args: any[]): FunctionBuilder;
}
export interface FunctionFunction {
  (functionName: string, ...arguments: any[]): FunctionBuilder;

  now(precision: number): FunctionBuilder;
  now(): FunctionBuilder;

  coalesce: SqlFunctionShortcut;
  concat: SqlFunctionShortcut;
  sum: SqlFunctionShortcut;
  avg: SqlFunctionShortcut;
  min: SqlFunctionShortcut;
  max: SqlFunctionShortcut;
  count: SqlFunctionShortcut;
  upper: SqlFunctionShortcut;
  lower: SqlFunctionShortcut;
}

export interface ComposeFunction {
  (...plugins: Plugin[]): Plugin;
  (plugins: Plugin[]): Plugin;
}

export interface AsArrayFunction {
  <T>(value: T | T[] | undefined): T[];
}

export interface Plugin {
  <M extends typeof Model>(modelClass: M): M;
}

export interface MixinFunction {
  <MC extends AnyModelConstructor>(modelClass: MC, ...plugins: Plugin[]): MC;
  <MC extends AnyModelConstructor>(modelClass: MC, plugins: Plugin[]): MC;
}

export interface Aliasable {
  as(alias: string): this;
}

export interface Castable extends Aliasable {
  castText(): this;
  castInt(): this;
  castBigInt(): this;
  castFloat(): this;
  castDecimal(): this;
  castReal(): this;
  castBool(): this;
  castJson(): this;
  castArray(): this;
  asArray(): this;
  castType(sqlType: string): this;
  castTo(sqlType: string): this;
}

export type Raw = RawBuilder | Knex.Raw;
export type Operator = string;
export type ColumnRef = string | Raw | ReferenceBuilder;
export type TableRef<QB extends AnyQueryBuilder> = ColumnRef | AnyQueryBuilder | CallbackVoid<QB>;

export type PrimitiveValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Buffer
  | string[]
  | number[]
  | boolean[]
  | bigint[]
  | Date[]
  | Buffer[]
  | null;

export type Expression<T> = T | Raw | ReferenceBuilder | ValueBuilder | AnyQueryBuilder;

export type Id = string | number | BigInt | Buffer;
export type CompositeId = Id[];
export type MaybeCompositeId = Id | CompositeId;

export interface ExpressionObject {
  [key: string]: Expression<PrimitiveValue>;
}

export interface PrimitiveValueObject {
  [key: string]: PrimitiveValue;
}

export interface CallbackVoid<T> {
  (this: T, arg: T): void;
}

export type Identity<T> = (value: T) => T;
export type AnyQueryBuilder = QueryBuilder<any, any, any>;
export type AnyModelConstructor = ModelConstructor<Model>;
export type ModifierFunction<QB extends AnyQueryBuilder> = (qb: QB, ...args: any[]) => void;
export type Modifier<QB extends AnyQueryBuilder = AnyQueryBuilder> =
  ModifierFunction<QB> | string | string[] | Record<string, Expression<PrimitiveValue>>;
export type OrderByDirection = 'asc' | 'desc' | 'ASC' | 'DESC';
export type OrderByNulls = 'first' | 'last';

export interface Modifiers<QB extends AnyQueryBuilder = AnyQueryBuilder> {
  [key: string]: Modifier<QB>;
}

export type RelationExpression<M extends Model> = string | object;

// Type-level parsing of relation expressions, used to narrow the result
// types of `withGraphFetched()`, `withGraphJoined()` and `fetchGraph()`.

/**
 * Parses a relation expression, in string or object notation, into a tree
 * of fetched relations: '[pets.owner, children]' and
 * `{ pets: { owner: true }, children: true }` both become
 * `{ pets: { owner: {} }, children: {} }`.
 *
 * Anything that isn't a literal expression (e.g. a `string` variable) yields
 * `{}`, and so do nodes the parser doesn't understand (aliases, `*`,
 * recursion with `^`), so these simply don't narrow. So does `never`, which
 * TypeScript substitutes for E when it checks the intersections of `Rebind`.
 */
export type ParseRelationExpression<E> = [E] extends [never]
  ? {}
  : string extends E
    ? {}
    : E extends string
      ? ParseRelationString<E>
      : ParseRelationObject<E>;

export type Whitespace = ' ' | '\n' | '\r' | '\t';

export type Trim<S extends string> = S extends `${Whitespace}${infer R}`
  ? Trim<R>
  : S extends `${infer L}${Whitespace}`
    ? Trim<L>
    : S;

/**
 * Counts the occurrences of character C in S, as a tuple length.
 */
export type CountChar<
  S extends string,
  C extends string,
  N extends 0[] = [],
> = S extends `${string}${C}${infer R}` ? CountChar<R, C, [...N, 0]> : N['length'];

/**
 * True if S has as many opening as closing brackets and parentheses.
 */
export type IsBalanced<S extends string> =
  CountChar<S, '['> extends CountChar<S, ']'>
    ? CountChar<S, '('> extends CountChar<S, ')'>
      ? true
      : false
    : false;

/**
 * Splits a list of expressions at the commas that aren't nested inside
 * brackets or parentheses: 'a, b.[c, d]' -> ['a', 'b.[c, d]'].
 */
export type SplitList<
  S extends string,
  Acc extends string = '',
  Out extends string[] = [],
> = S extends `${infer Head},${infer Rest}`
  ? IsBalanced<`${Acc}${Head}`> extends true
    ? SplitList<Rest, '', [...Out, `${Acc}${Head}`]>
    : SplitList<Rest, `${Acc}${Head},`, Out>
  : [...Out, `${Acc}${S}`];

export type ParseRelationList<L extends string[], Acc = {}> = L extends [
  infer H extends string,
  ...infer T extends string[],
]
  ? ParseRelationList<T, Acc & ParseRelationString<H>>
  : Acc;

/**
 * Parses '[a, b]', 'a.b' and 'a' style expressions.
 */
export type ParseRelationString<S extends string> =
  Trim<S> extends `[${infer Inner}]`
    ? ParseRelationList<SplitList<Inner>>
    : Trim<S> extends `${infer Head}.${infer Rest}`
      ? IsBalanced<Head> extends true
        ? RelationNode<RelationName<Head>, ParseRelationString<Rest>>
        : {}
      : RelationNode<RelationName<S>, {}>;

/**
 * Extracts the relation name from a single node, dropping modifiers:
 * 'pets(selectName)' -> 'pets'. Returns never for nodes that can't be
 * narrowed: aliases ('pets as p'), '*' and recursion ('^', '^2').
 */
export type RelationName<S extends string> =
  Trim<S> extends `${infer Name}(${string})`
    ? RelationName<Name>
    : Trim<S> extends infer Name extends string
      ? Name extends '' | '*' | `^${string}` | `${string}${Whitespace}${string}`
        ? never
        : string extends Name
          ? never
          : Name
      : never;

export type RelationNode<Name extends string, Children> = [Name] extends [never]
  ? {}
  : { [K in Name]: Children };

/**
 * Parses `{ a: true, b: { c: true } }` style expressions. Keys starting with
 * `$` are options, and aliased nodes (`{ p: { $relation: 'pets' } }`) are
 * skipped.
 */
export type ParseRelationObject<E> = string extends keyof E
  ? {}
  : {
      [
        K in keyof E as K extends `$${string}`
          ? never
          : false extends E[K]
            ? never
            : E[K] extends { $relation: any }
              ? never
              : K
      ]: E[K] extends object ? ParseRelationObject<E[K]> : {};
    };

/**
 * Marks the relations in tree T as fetched on model M: they become required
 * and are narrowed recursively. Only `undefined` is removed: declared `null`
 * is kept, as to-one relations can be null when there is no related row.
 */
export type WithGraph<M, T> = [keyof T] extends [never]
  ? M
  : WithGraphRelations<M, T, FetchedRelations<M, T>>;

export type WithGraphRelations<M, T, K extends keyof M & keyof T> = [K] extends [never]
  ? M
  : { -readonly [P in K]-?: WithGraphProperty<Defined<M[P]>, T[P]> } & UnnarrowedMethods<M> & M;

/**
 * `$query()` of the un-narrowed model M, as it doesn't fetch the relations
 * that were fetched on the instance. Otherwise its polymorphic `this` would
 * resolve to the narrowed model. With chained narrowing, the first `$query`
 * signature of the intersection wins, which is the one of the innermost,
 * un-narrowed model.
 */
export type UnnarrowedMethods<M> = Pick<M, Extract<'$query', keyof M>>;

/**
 * The keys of tree T that are relation properties of model M.
 */
export type FetchedRelations<M, T> = {
  [K in keyof M & keyof T]: NonNullable<M[K]> extends Model | Model[] ? K : never;
}[keyof M & keyof T];

export type WithGraphProperty<P, T> = [keyof T] extends [never]
  ? P
  : P extends Array<infer I>
    ? WithGraph<I, T>[]
    : P extends Model
      ? WithGraph<P, T>
      : P;

/**
 * The model type after fetching the relation expression E on model M.
 */
export type WithGraphModel<M, E> = WithGraph<M, ParseRelationExpression<E>>;

/**
 * The query builder type after `withGraphFetched(E)` / `withGraphJoined(E)`
 * on QB. The model type is narrowed, and the query builder for the narrowed
 * model is looked up through its `QueryBuilderType`, so custom query
 * builders are kept. Falls back to QB if nothing can be narrowed, or if the
 * model type is `any` (`0 extends 1 & M`), e.g. for AnyQueryBuilder.
 * `QB extends unknown` makes this distributive, so that in generic code (e.g.
 * `this` in model methods), TypeScript can resolve it through the constraint
 * of QB.
 */
export type WithGraphQueryBuilder<QB extends AnyQueryBuilder, E> = WithGraphTreeQueryBuilder<
  QB,
  ParseRelationExpression<E>
>;

export type WithGraphTreeQueryBuilder<QB extends AnyQueryBuilder, T> = [keyof T] extends [never]
  ? QB
  : QB extends unknown
    ? 0 extends 1 & ModelType<QB>
      ? QB
      : [FetchedRelations<ModelType<QB>, T>] extends [never]
        ? QB
        : WithResultKind<
            QB,
            KeepExtra<WithGraph<ModelType<QB>, T>['QueryBuilderType'], ExtraType<QB>>,
            ModelType<QB>,
            ResultType<QB>,
            T
          >
    : never;

/**
 * Narrows the rows in the result R by the relation tree T, after `select()`
 * narrowed them in strict mode.
 */
type WithGraphResult<R, T> = R extends readonly (infer I)[]
  ? WithGraph<I, T>[]
  : R extends Page<infer I>
    ? Page<WithGraph<I, T>>
    : R extends object
      ? WithGraph<R, T>
      : R;

/**
 * Converts the query builder NQB to the same result kind as QB:
 * array, page, single or maybe-single. Rows that `select()` narrowed in
 * strict mode or that have `jsonExtract()` values get the relations of tree T
 * instead. Any other result type, e.g. after `castTo()` or `patch()`, falls
 * back to QB, without narrowing.
 * QB's model type M and result type R are separate parameters so that QB
 * only appears in the result, and TypeScript can relate the kinds of two
 * query builders, e.g. of a custom query builder and its base class, through
 * QB alone. The page and `object` checks come before the single ones, so
 * that results like `number` or `Page<M>` are ruled out for a generic M too.
 */
export type WithResultKind<
  QB extends AnyQueryBuilder,
  NQB extends AnyQueryBuilder,
  M extends Model = ModelType<QB>,
  R = ResultType<QB>,
  T = {},
> = [R] extends [ExtractedRows]
  ? Rebind<QB, M, WithGraphResult<R, T>>
  : [R] extends [M[]]
    ? ArrayQueryBuilder<NQB>
    : [R] extends [Page<M>]
      ? PageQueryBuilder<NQB>
      : [R] extends [object | undefined]
        ? [R] extends [M]
          ? SingleQueryBuilder<NQB>
          : [R] extends [M | undefined]
            ? MaybeSingleQueryBuilder<NQB>
            : Rebind<QB, M, WithGraphResult<R, T>>
        : QB;

/**
 * The item of the result R of a query for model M, which `first()`,
 * `findById()`, `page()` and the other result kinds keep: in strict mode, the
 * item of an array or a page, or the single result, e.g. the rows narrowed by
 * `select()`. M in loose mode, and for other results, e.g. numbers.
 */
type ResultItem<R, M> = IfStrict<M, 0 extends 1 & R ? M : ItemOf<Exclude<R, undefined>, M>>;

type ItemOf<R, M> = R extends readonly (infer I)[]
  ? I
  : R extends Page<infer I>
    ? I
    : R extends object
      ? R
      : M;

/**
 * If T is an array, returns the item type, otherwise returns T.
 */
export type ItemType<T> = T extends Array<unknown> ? T[number] : T;

/**
 * Type for keys of non-function properties of T.
 */
export type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

// The type-only members of models, which aren't data, also the keys of the
// virtual attributes that `FromModel` adds.
type ModelTypeMembers = 'QueryBuilderType' | 'ColumnNameMapping' | `~virtual:${string}`;

/**
 * Type that attempts to only select the user-defined model properties.
 * Properties starting with `$` are internal, like in `toJSON()`.
 */
export type DataPropertyNames<T> = Exclude<
  NonFunctionPropertyNames<T>,
  ModelTypeMembers | `$${string}`
>;

/**
 * Removes `undefined` from a type.
 */
export type Defined<T> = Exclude<T, undefined>;

/**
 * A Pojo version of model.
 */
export type ModelObject<T extends Model> = Pick<T, DataPropertyNames<T>>;

/**
 * The JSON of model M, as `toJSON()` returns it: its properties without
 * methods, the results of the methods in `virtualAttributes` on models with
 * `FromModel`, and the related models as JSON too. Values aren't converted,
 * e.g. dates stay dates.
 */
export type ModelJson<M> = {
  [
    K in keyof Pick<M, (DataPropertyNames<M> | VirtualAttributeNames<M>) & keyof M>
  ]: K extends RelationPropertyNames<M>
    ? RelationJson<M[K]>
    : M[K] extends (...args: any) => infer R
      ? RelationJson<R>
      : M[K];
};

type VirtualAttributeNames<M> = {
  [K in keyof M]: K extends `~virtual:${infer N}` ? N : never;
}[keyof M];

type RelationJson<P> = P extends (infer I)[]
  ? ModelJson<I>[]
  : P extends readonly (infer I)[]
    ? readonly ModelJson<I>[]
    : P extends ModelLike
      ? ModelJson<P>
      : P;

/**
 * Any object that has some of the properties of model class T match this type.
 */
export type PartialModelObject<T extends Model> = {
  [K in DataPropertyNames<T>]?: Defined<T[K]> extends Model
    ? T[K] | PartialModelObject<Defined<T[K]>>
    : Defined<T[K]> extends Array<infer I>
      ? I extends Model
        ? I[] | PartialModelObject<I>[]
        : Expression<T[K]>
      : NonNullable<T[K]> extends Model
        ? Expression<T[K]> | PartialModelObject<NonNullable<T[K]>> // nullable to-one relations
        : Expression<T[K]>;
};

/**
 * Like PartialModelObject, but relation properties are not allowed. Unlike
 * PartialModelObject, this doesn't depend on the relation types, so query
 * builders for models with narrowed relations (see WithGraphModel) remain
 * assignable to the query builders for the plain models.
 */
export type PartialModelProps<T extends Model> = {
  [K in DataPropertyNames<T>]?: K extends RelationPropertyNames<T> ? never : Expression<T[K]>;
};

/**
 * The data of a row of model M, as `insert()`, `patch()`, `update()` and
 * `relate()` take it: a model instance, or some of its properties without
 * relations, as these methods don't write relations. Only the columns of
 * instances are checked, so that instances can also be passed to the query
 * builders of narrowed models, e.g. after `withGraphFetched()`.
 */
export type PartialModelRow<M extends Model> =
  (ModelLike & { [K in InsertablePropertyNames<M>]?: M[K] }) | PartialModelProps<M>;

/**
 * The data of `patch()` and `merge()`: a row of model M, also with field
 * expression keys like `'address:street'` that write parts of json columns.
 */
export type PartialModelPatch<M extends Model> =
  | PartialModelRow<M>
  | (PartialModelProps<M> & {
      [K in `${InsertablePropertyNames<M> & string}:${string}`]?: unknown;
    });

/**
 * Additional optional parameters that may be used in graphs.
 */
export type GraphParameters = {
  '#dbRef'?: MaybeCompositeId;
  '#ref'?: string;
  '#id'?: string;
  '#unrelate'?: boolean;
  '#delete'?: boolean;
};

/**
 * Just like PartialModelObject but this is applied recursively to relations.
 */
export type PartialModelGraph<M, T = M & GraphParameters> = T extends any
  ? {
      [K in DataPropertyNames<T>]?: null extends T[K]
        ? PartialModelGraphField<NonNullable<T[K]>> | null // handle nullable BelongsToOneRelations
        : PartialModelGraphField<T[K]>;
    }
  : never;

export type PartialModelGraphField<F> =
  Defined<F> extends Model
    ? PartialModelGraph<Defined<F>>
    : Defined<F> extends Array<infer I>
      ? I extends Model
        ? PartialModelGraph<I>[]
        : Expression<F>
      : Expression<F>;

/**
 * Marks a model property whose value the database generates, like an
 * auto-incremented id, a timestamp or a column with a default value. It
 * reads as T and accepts T, but `Insertable` and `InsertableGraph` treat
 * the property as optional:
 *
 *   id!: Generated<number>;
 */
export type Generated<T> = T extends null | undefined ? T : T & GeneratedBrand;

export interface GeneratedBrand {
  readonly [generated]?: true;
}

/**
 * Insert keys are optional for optional, nullable and generated properties.
 */
export type OptionalInsertPropertyNames<M> = {
  [K in keyof M]-?: {} extends Pick<M, K>
    ? K
    : null extends M[K]
      ? K
      : typeof generated extends keyof NonNullable<M[K]>
        ? K
        : never;
}[keyof M];

export type InsertablePropertyNames<M> = Exclude<DataPropertyNames<M>, RelationPropertyNames<M>>;

/**
 * The data to insert a model M with `insert()`. Unlike `PartialModelObject`,
 * all properties are required except optional, nullable and `Generated`
 * ones. Relation properties are left out.
 */
export type Insertable<M extends Model> = {
  [K in Exclude<InsertablePropertyNames<M>, OptionalInsertPropertyNames<M>>]: Expression<M[K]>;
} & {
  [K in Extract<InsertablePropertyNames<M>, OptionalInsertPropertyNames<M>>]?: Expression<M[K]>;
};

/**
 * Like `Insertable`, but for `insertGraph()`: relation properties are
 * optional and hold the insertable graphs of the related models, or
 * references to existing ones through `#dbRef` or `#ref`.
 */
export type InsertableGraph<M extends Model> = Insertable<M> &
  Omit<GraphParameters, '#dbRef' | '#ref'> & {
    [K in RelationPropertyNames<M>]?: InsertableGraphField<M[K]>;
  };

export type InsertableGraphReference = { '#dbRef': MaybeCompositeId } | { '#ref': string };

export type InsertableGraphField<F> =
  NonNullable<F> extends (infer I extends Model)[]
    ? (InsertableGraph<I> | InsertableGraphReference)[]
    : NonNullable<F> extends infer I extends Model
      ? InsertableGraph<I> | InsertableGraphReference | Extract<F, null>
      : never;

/**
 * Extracts the property names (excluding relations) of a model class.
 */
export type ModelProps<T extends Model> = Exclude<
  {
    [K in keyof T]?: Defined<T[K]> extends Model
      ? never
      : Defined<T[K]> extends Array<infer I>
        ? I extends Model
          ? never
          : K
        : T[K] extends Function
          ? never
          : K;
  }[keyof T],
  undefined | ModelTypeMembers
>;

/**
 * Extracts the relation names of the a model class.
 */
export type ModelRelations<T extends Model> = Defined<
  {
    [K in keyof T]?: Defined<T[K]> extends Model
      ? K
      : Defined<T[K]> extends Array<infer I>
        ? I extends Model
          ? K
          : never
        : never;
  }[keyof T]
>;

/**
 * Given a model property type, returns a query builer type of
 * correct kind if the property is a model or a model array. Queries for
 * to-one relations resolve to `undefined` when there's no related row.
 */
export type RelatedQueryBuilder<T> = T extends Model
  ? MaybeSingleQueryBuilder<QueryBuilderType<T>>
  : T extends Array<infer I>
    ? I extends Model
      ? QueryBuilderType<I>
      : never
    : never;

/**
 * Just like RelatedQueryBuilder but always returns an array
 * query builder even if the property type is a model and not
 * an array of models.
 */
export type ArrayRelatedQueryBuilder<T> = T extends Model
  ? QueryBuilderType<T>
  : T extends Array<infer I>
    ? I extends Model
      ? QueryBuilderType<I>
      : never
    : never;

/**
 * Gets the query builder type for a model type.
 */
export type QueryBuilderType<T extends { QueryBuilderType: any }> = T['QueryBuilderType'];

/**
 * Gets the model type from a query builder type.
 */
export type ModelType<T extends { ModelType: any }> = T['ModelType'];

/**
 * Gets the result type from a query builder type.
 */
export type ResultType<T extends { ResultType: any }> = T['ResultType'];

/**
 * Re-instantiates the query builder QB with the model type M, the result
 * type R and the extra type X, through its `RebindType`. The `~rebind` slot is
 * `unknown`, so the intersection resolves it to exactly `[M, R, X]`.
 * Rebinding QB's own `RebindType` instead of QB keeps the intersection small,
 * which TypeScript checks much faster.
 */
type Rebind<
  QB extends AnyQueryBuilder,
  M extends Model,
  R,
  X = IfStrict<unknown, ExtraType<QB>>,
> = (QB['RebindType'] & {
  '~rebind': [M, R, X];
})['RebindType'];

/**
 * Gets the extra type from a query builder type: what the types know about
 * the query beyond its model and result, see `QueryExtra`.
 */
export type ExtraType<T extends { ExtraType: any }> = T['ExtraType'];

type WithExtra<QB extends AnyQueryBuilder, X> = Rebind<QB, ModelType<QB>, ResultType<QB>, X>;

// The narrowed query builders of `withGraph*()` start without the extra type
// of QB, so it is passed on, if there is one.
type KeepExtra<NQB extends AnyQueryBuilder, X> = X extends QueryExtra ? WithExtra<NQB, X> : NQB;

/**
 * Gets the single item query builder type for a query builder.
 */
export type SingleQueryBuilder<QB extends AnyQueryBuilder> = QB['~single'];

/**
 * Gets the single or undefined item query builder type for a query builder.
 */
export type MaybeSingleQueryBuilder<QB extends AnyQueryBuilder> = QB['~maybeSingle'];

/**
 * Gets the multi-item query builder type for a query builder.
 */
export type ArrayQueryBuilder<QB extends AnyQueryBuilder> = QB['~array'];

/**
 * Gets the number query builder type for a query builder.
 */
export type NumberQueryBuilder<QB extends AnyQueryBuilder> = QB['~number'];

/**
 * Gets the page query builder type for a query builder.
 */
export type PageQueryBuilder<QB extends AnyQueryBuilder> = QB['~page'];

// Strict mode checks the column names and values of queries against the
// models. Augment `TypeConfig` to opt in:
//
//   declare module 'objection' {
//     interface TypeConfig {
//       strict: true;
//     }
//   }

export interface TypeConfig {}

type IsStrict = TypeConfig extends { strict: true } ? true : false;

// As IsStrict isn't generic, IfStrict resolves eagerly.
type IfStrict<Loose, Strict> = IsStrict extends true ? Strict : Loose;

/**
 * The column names of model M: its properties without methods and relations,
 * in snake case for models that declare a snake case `ColumnNameMapping`.
 */
export type ColumnName<M> = keyof ModelColumns<M> & string;

/**
 * The columns of model M by their names in queries, with their types.
 */
type ModelColumns<M> = M extends { ColumnNameMapping: 'snakeCase' | 'upperSnakeCase' }
  ? {
      [
        K in InsertablePropertyNames<M> & string as M extends {
          ColumnNameMapping: 'upperSnakeCase';
        }
          ? Uppercase<SnakeCase<K>>
          : SnakeCase<K>
      ]: M[K];
    }
  : Pick<M, InsertablePropertyNames<M> & keyof M>;

/**
 * Converts a property name to snake case, as `snakeCaseMappers()` does with its
 * default options: 'firstName' -> 'first_name', 'fooBAR' -> 'foo_bar'.
 */
type SnakeCase<
  S extends string,
  Prev extends string = '',
  Out extends string = '',
> = S extends `${infer C}${infer Rest}`
  ? SnakeCase<
      Rest,
      C,
      `${Out}${Prev extends ''
        ? Lowercase<C>
        : IsUpperCase<C> extends true
          ? IsUpperCase<Prev> extends true
            ? Lowercase<C>
            : `_${Lowercase<C>}`
          : C}`
    >
  : Out;

type IsUpperCase<C extends string> =
  C extends Uppercase<C> ? (C extends Lowercase<C> ? false : true) : false;

/**
 * The model at the end of the relation path P of model M, e.g. 'pets:owner',
 * as objection names joined relations. `never` if P isn't a relation path.
 */
type RelationPathModel<M, P extends string> = P extends `${infer R}:${infer Rest}`
  ? R extends RelationPropertyNames<M>
    ? RelationPathModel<RelatedModel<M[R]>, Rest>
    : never
  : P extends RelationPropertyNames<M>
    ? RelatedModel<M[P]>
    : never;

type RelatedModel<P> = NonNullable<P> extends readonly (infer I)[] ? I : NonNullable<P>;

/**
 * Checks the column C of a query for model M: a column of M, or qualified
 * with a relation path, a column of the related model. Other qualifiers, e.g.
 * table names and aliases, aren't checked. Resolves to C if it is valid, or
 * else to the valid columns, for the error message.
 */
type CheckColumn<M, C extends string> = C extends `${infer Q}.${infer Col}`
  ? [RelationPathModel<M, Q>] extends [never]
    ? C
    : Col extends ColumnName<RelationPathModel<M, Q>>
      ? C
      : `${Q}.${ColumnName<RelationPathModel<M, Q>>}`
  : C extends ColumnName<M>
    ? C
    : ColumnName<M>;

/**
 * The type of the column C of model M, `unknown` if it can't be resolved.
 */
type ColumnType<M, C extends string> = C extends `${infer Q}.${infer Col}`
  ? PropertyType<RelationPathModel<M, Q>, Col>
  : PropertyType<M, C>;

type PropertyType<M, C> = [M] extends [never]
  ? unknown
  : C extends keyof ModelColumns<M>
    ? ModelColumns<M>[C]
    : unknown;
/**
 * Whether the columns of model M are checked: not for the base `Model` and
 * other models without declared columns, e.g. in untyped modifiers, nor for
 * models that declare `ColumnNameMapping: 'open'`, e.g. for custom column name
 * mappers, nor for `any`, which is also what TypeScript checks arguments
 * against when M is generic, e.g. in the methods of custom query builders.
 * `any` is detected by a member that no type has: unlike `0 extends 1 & M`,
 * the check of `[M]` is generic in M, which TypeScript needs to only relate
 * arguments to the `false` branch of conditionals on IsConcreteModel in
 * generic code.
 */
type IsConcreteModel<M> = [M] extends [{ '~anyModel': true }]
  ? false
  : M extends { ColumnNameMapping: 'open' }
    ? false
    : [ColumnName<M>] extends [never]
      ? false
      : true;

type CheckedColumn<M, C extends string> =
  IsConcreteModel<M> extends true ? CheckColumn<M, C> : string;

/**
 * A column argument: checked against model M in strict mode, any column in
 * loose mode, where the model's properties come first, for autocompletion.
 */
type ColumnArg<M, C extends string> = IfStrict<ModelProps<M & Model>, CheckedColumn<M, C>>;

/**
 * The value of a column of type T in conditions: `null` is always accepted,
 * for `IS NULL` checks, dates accept strings too, and objects (JSON columns)
 * and columns of unknown type anything.
 */
type ColumnValue<T> = unknown extends T
  ? PrimitiveValue | object
  : NonNullable<T> extends Date
    ? Date | string | null
    : NonNullable<T> extends readonly unknown[] | string | number | boolean | bigint
      ? NonNullable<T> | null
      : NonNullable<T> extends object
        ? PrimitiveValue | object
        : NonNullable<T> | null;

/**
 * The operators that compare a value of the column's type. Others, e.g.
 * 'like' or the JSON operators, take any value.
 */
type ComparisonOperator = '=' | '<>' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'not in';

type ValueArg<M, C extends string> = IfStrict<
  Expression<PrimitiveValue>,
  IsConcreteModel<M> extends true
    ? Expression<ColumnValue<ColumnType<M, C>>>
    : Expression<PrimitiveValue>
>;

/**
 * The values of conditions with the operator O: comparisons are checked
 * against the column's type, also as lists for 'in', other operators take
 * any value.
 */
type OperatorValueArg<M, C extends string, O extends string> = IfStrict<
  Expression<PrimitiveValue> | readonly Expression<PrimitiveValue>[],
  Lowercase<O> extends ComparisonOperator
    ? ValueArg<M, C> | readonly ValueArg<M, C>[]
    : Expression<PrimitiveValue | object> | readonly Expression<PrimitiveValue>[]
>;

/**
 * The column checks of strict mode: C resolved to the checked column, or
 * `string` for models that aren't concrete. In loose mode, `never`, which
 * disables the overloads that use it.
 */
type StrictColumn<M, C extends string> = IfStrict<never, CheckedColumn<M, C>>;

/**
 * Column references that aren't checked: any in loose mode, only raw and
 * `ref()` in strict mode, the way to refer to columns of other queries, and
 * any column for query builders whose model isn't concrete. Some generic
 * query builders, e.g. after `withGraphFetched()` in model methods, resolve to
 * unions, on which only these non-generic signatures can be called.
 */
type RefArg<QB extends AnyQueryBuilder> = IfStrict<
  ColumnRef,
  Raw | ReferenceBuilder | (IsConcreteModel<ModelType<QB>> extends true ? never : string)
>;

/**
 * The columns of `orderBy()`, which also takes the aliases of the selections.
 * `groupBy()` and `having()` don't: not all databases resolve them there.
 */
type StrictOutputColumn<QB extends AnyQueryBuilder, C extends string> = IfStrict<
  never,
  C extends OutputColumn<QB> ? C : CheckedColumn<ModelType<QB>, C>
>;

/**
 * Checks the columns C of a column list. Raw and `ref()` are passed through.
 */
type StrictColumns<M, C extends readonly unknown[]> = IfStrict<
  never,
  {
    [I in keyof C]: C[I] extends string
      ? StrictColumn<M, C[I]>
      : C[I] extends Raw | ReferenceBuilder
        ? C[I]
        : Raw | ReferenceBuilder;
  }
>;

/**
 * Field expressions: a column, optionally followed by a JSON path,
 * 'column:path.to.key'. The column is checked as in CheckColumn.
 */
type StrictFieldExpression<M, C extends string> = IfStrict<
  never,
  IsConcreteModel<M> extends true
    ? CheckColumn<M, FieldColumn<M, C>> extends FieldColumn<M, C>
      ? C
      : CheckColumn<M, FieldColumn<M, C>>
    : string
>;

type FieldColumn<M, C extends string> = C extends `${infer Q}.${infer Rest}`
  ? [RelationPathModel<M, Q>] extends [never]
    ? FieldRootColumn<C>
    : `${Q}.${FieldRootColumn<Rest>}`
  : FieldRootColumn<C>;

type FieldRootColumn<C extends string> = C extends `${infer Col}:${string}` ? Col : C;

/**
 * Selections and aggregations: '*', 'table.*', columns and 'column as alias'.
 */
type CheckSelection<M, C extends string> = C extends '*' | `${string}.*`
  ? C
  : C extends `${infer Col} ${'as' | 'AS'} ${string}`
    ? Col extends '*'
      ? C
      : CheckColumn<M, Col> extends Col
        ? C
        : `${CheckColumn<M, Col>} as ${string}`
    : CheckColumn<M, C>;

type CheckedSelection<M, C extends string> =
  IsConcreteModel<M> extends true ? CheckSelection<M, C> : string;

type StrictSelections<M, C extends readonly unknown[]> = IfStrict<
  never,
  {
    [I in keyof C]: C[I] extends string
      ? CheckedSelection<M, C[I]>
      : C[I] extends number | Raw | ReferenceBuilder | AnyQueryBuilder
        ? C[I]
        : C[I] extends Function
          ? CallbackVoid<AnyQueryBuilder>
          : C[I] extends object
            ? StrictSelectionObject<M, C[I]>
            : never;
  }
>;

type StrictSelectionObject<M, O> = {
  [K in keyof O]: O[K] extends string
    ? CheckedSelection<M, O[K]>
    : O[K] extends readonly unknown[]
      ? StrictSelections<M, O[K]>
      : O[K] extends Raw | ReferenceBuilder | AnyQueryBuilder
        ? O[K]
        : never;
};

/**
 * The query builder QB with its result rows narrowed to the properties P in
 * strict mode, next to the model's methods and relations, as after `select()`
 * and the aggregates, marked with SelectedBrand. Repeated selections add up. Queries
 * that aren't checked, e.g. in generic code, aren't narrowed.
 */
type NarrowRows<QB extends AnyQueryBuilder, P, All extends boolean = false> = RowsQueryBuilder<
  QB,
  SelectBase<ResultItem<ResultType<QB>, ModelType<QB>>, ModelType<QB>, All> & P & SelectedBrand<{}>
>;

/**
 * The query builder QB with the item of its result replaced by Row in strict
 * mode. Queries that aren't checked keep their rows.
 */
type RowsQueryBuilder<QB extends AnyQueryBuilder, Row> = IfStrict<
  QB,
  IsConcreteModel<ModelType<QB>> extends true
    ? Rebind<QB, ModelType<QB>, SelectResult<ResultType<QB>, Row>>
    : QB
>;

/**
 * The query builder QB after `clearSelect()`, which selects all columns again,
 * next to the values of `jsonExtract()`.
 */
type ClearSelectQueryBuilder<QB extends AnyQueryBuilder> =
  ResultItem<ResultType<QB>, ModelType<QB>> extends infer Item
    ? Item extends SelectedBrand<unknown>
      ? RowsQueryBuilder<
          QB,
          ModelType<QB> &
            (Item extends ExtractedBrand<infer A>
              ? ExtractedProperties<ModelType<QB>, keyof A & string>
              : {})
        >
      : QB
    : never;

/**
 * The query builder QB after `jsonExtract()` with the alias A, which adds the
 * extracted value to the rows. It isn't a select, so it doesn't narrow them.
 */
type JsonExtractQueryBuilder<QB extends AnyQueryBuilder, A extends string> = RowsQueryBuilder<
  QB,
  ResultItem<ResultType<QB>, ModelType<QB>> & ExtractedProperties<ModelType<QB>, A>
>;

type ExtractedProperties<M, A extends string> = {
  [K in ResultKey<M, A>]: unknown;
} & ExtractedBrand<{ [K in A]: true }>;

/**
 * The query builder QB after selecting C. Selections of all columns keep the
 * columns in the rows.
 */
type SelectQueryBuilder<QB extends AnyQueryBuilder, C extends readonly unknown[]> = NarrowRows<
  QB,
  SelectedRow<ModelType<QB>, C>,
  true extends SelectsAll<C[number]> ? true : false
>;

/**
 * The query builder QB after the aggregation C. The values of `count()`,
 * `sum()` and `avg()` are numbers, but some drivers return them as strings,
 * e.g. Postgres for bigint and numeric. The ones of `min()` and `max()` have
 * the column's type.
 */
type AggregateQueryBuilder<
  QB extends AnyQueryBuilder,
  C,
  V extends AggregateValue,
  A extends string = never,
> = NarrowRows<
  QB,
  [A] extends [never]
    ? AggregatedProperties<ModelType<QB>, C, V>
    : { [K in ResultKey<ModelType<QB>, A>]: number | string } & SelectedBrand<{ [K in A]: true }>
>;

type AggregateValue = 'number' | 'column';

type AggregatedProperties<M, C, V extends AggregateValue> = C extends `${infer Col} ${
  'as' | 'AS'} ${infer A}`
  ? { [K in ResultKey<M, A>]: AggregateType<M, Col, V> } & SelectedBrand<{ [K in A]: true }>
  : C extends string
    ? UnknownSelection
    : C extends readonly unknown[]
      ? AggregatedList<M, C, V>
      : {
          [K in keyof C & string as ResultKey<M, K>]: C[K] extends string
            ? AggregateType<M, C[K], V>
            : unknown;
        } & SelectedBrand<{ [K in keyof C & string]: true }>;

type AggregatedList<
  M,
  C extends readonly unknown[],
  V extends AggregateValue,
> = C extends readonly [infer X, ...infer Rest]
  ? AggregatedProperties<M, X, V> & AggregatedList<M, Rest, V>
  : {};

type AggregateType<M, Col extends string, V extends AggregateValue> = V extends 'number'
  ? number | string
  : SelectedType<M, Col>;

/**
 * The rows narrowed by `select()` carry the SQL aliases A of their selections,
 * which `orderBy()` takes, see OutputColumn. It is exported for declaration
 * files to name the rows, like GeneratedBrand.
 */
export type SelectedBrand<A> = { readonly [selected]: A };

/**
 * The rows with values of `jsonExtract()` carry their SQL aliases A apart from
 * SelectedBrand, as they aren't narrowed.
 */
export type ExtractedBrand<A> = { readonly [extracted]: A };

/**
 * The extra type of queries in strict mode: the model class C that started the
 * query, e.g. with `Person.query()`, and the modifiers P registered with
 * `modifiers()`, to check the names of modifiers.
 */
export interface QueryExtra<C = unknown, P = unknown> {
  modelClass: C;
  registered: P;
}

// The results whose rows have `jsonExtract()` values, which `withGraph*()`
// keeps instead of converting the result kind:
type ExtractedRows =
  ExtractedBrand<unknown>[] | Page<ExtractedBrand<unknown>> | ExtractedBrand<unknown> | undefined;

/**
 * The base of the rows of a selection: the model without its columns for the
 * first one, the rows selected so far for further ones, and the model's
 * columns too when selecting all of them.
 */
type SelectBase<Item, M, All extends boolean> = All extends true
  ? M & Item
  : Item extends SelectedBrand<unknown>
    ? Item
    : Omit<Item, InsertablePropertyNames<M>>;

// Selections that can't be resolved, e.g. raw ones, add any properties of
// unknown types, under any aliases.
type UnknownSelection = { [key: string]: unknown } & SelectedBrand<{ [key: string]: true }>;

type SelectsAll<X> = X extends '*' | `${string}.*` ? true : false;

/**
 * Replaces the item of the result R with the row.
 */
type SelectResult<R, Row> = R extends readonly unknown[]
  ? Row[]
  : R extends Page<unknown>
    ? Page<Row>
    : R extends undefined
      ? undefined
      : R extends object
        ? Row
        : R;

/**
 * The properties of the rows of the selections C.
 */
type SelectedRow<M, C extends readonly unknown[]> = C extends readonly [infer X, ...infer Rest]
  ? SelectedProperties<M, X> & SelectedRow<M, Rest>
  : {};

type SelectedProperties<M, X> = X extends '*' | `${string}.*`
  ? {}
  : X extends `${infer Col} ${'as' | 'AS'} ${infer A}`
    ? { [K in ResultKey<M, A>]: SelectedType<M, Col> } & SelectedBrand<{ [K in A]: true }>
    : X extends string
      ? { [K in ResultKey<M, X extends `${string}.${infer Col}` ? Col : X>]: SelectedType<M, X> }
      : X extends Raw | ReferenceBuilder | AnyQueryBuilder | Function | number
        ? UnknownSelection
        : {
            [K in keyof X & string as ResultKey<M, K>]: X[K] extends string
              ? SelectedType<M, X[K]>
              : unknown;
          } & SelectedBrand<{ [K in keyof X & string]: true }>;

// Columns qualified with a name that isn't a relation path, usually the
// table name, are looked up in the model.
type SelectedType<M, C extends string> = C extends `${infer Q}.${infer Col}`
  ? [RelationPathModel<M, Q>] extends [never]
    ? PropertyType<M, Col>
    : ColumnType<M, C>
  : ColumnType<M, C>;

/**
 * The property of the column or alias C in the result rows: `snakeCaseMappers()`
 * converts them to camel case, with `upperCase: true` after lowering the case
 * of names in upper case.
 */
type ResultKey<M, C extends string> = M extends { ColumnNameMapping: 'snakeCase' }
  ? CamelCase<C>
  : M extends { ColumnNameMapping: 'upperSnakeCase' }
    ? CamelCase<C extends Uppercase<C> ? Lowercase<C> : C>
    : C;

type CamelCase<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${CamelCase<Capitalize<T>>}`
  : S;

/**
 * The SQL aliases of the selections of QB, which `orderBy()` takes next to the
 * columns.
 */
type OutputColumn<QB extends AnyQueryBuilder> =
  ResultItem<ResultType<QB>, ModelType<QB>> extends infer Item
    ? | (Item extends SelectedBrand<infer A> ? keyof A & string : never)
      | (Item extends ExtractedBrand<infer A> ? keyof A & string : never)
    : never;

/**
 * Checks the keys of a where object as columns, and their values.
 */
type StrictWhereObject<M, O> = IfStrict<
  never,
  IsConcreteModel<M> extends true
    ? {
        [K in keyof O]: K extends string
          ? CheckColumn<M, K> extends K
            ? Expression<ColumnValue<ColumnType<M, K>>>
            : never
          : never;
      }
    : object
>;

/**
 * The names in the relation tree T that aren't relations of model M, or of
 * the related models along the tree.
 */
type UnknownRelations<M, T> = {
  [K in keyof T & string]: K extends RelationPropertyNames<M>
    ? UnknownRelations<RelatedModel<M[K]>, T[K]>
    : K;
}[keyof T & string];

/**
 * In strict mode, relation expressions are intersected with this, to reject
 * the names of unknown relations, and of unknown modifiers, checked against
 * the related class of each node and the modifiers registered on query
 * builder QB.
 */
type CheckRelationExpression<M, E, QB extends AnyQueryBuilder = never> = IfStrict<
  unknown,
  IsConcreteModel<M> extends true
    ? [UnknownRelations<M, ParseRelationExpression<E>>] extends [never]
      ? CheckModifierExpression<E, QB>
      : { '~unknownRelation': UnknownRelations<M, ParseRelationExpression<E>> }
    : unknown
>;

type CheckModifierExpression<E, QB extends AnyQueryBuilder> =
  HasQueryClass<QB> extends true
    ? [CheckedModifiers<E, QB>] extends [never]
      ? unknown
      : { '~unknownModifier': CheckedModifiers<E, QB> }
    : unknown;

// Queries in generic code, where the model class can't be resolved, aren't
// checked.
type HasQueryClass<QB extends AnyQueryBuilder> =
  IsConcreteModel<ModelType<QB>> extends false
    ? false
    : [QueryClass<QB>] extends [never]
      ? false
      : true;

// Only expressions with modifiers are checked for them.
type CheckedModifiers<E, QB> = E extends `${string}(${string}` | object
  ? UnknownModifiers<
      ClassMappings<QueryClass<QB>>,
      ParseModifierExpression<E>,
      keyof RegisteredModifiers<QB>
    >
  : never;

/**
 * The modifiers that a modifier name can refer to on query builder QB: the
 * `modifiers` of the model class that started the query, and those registered
 * with `modifiers()` before. Unknown names are only rejected in strict mode,
 * and only on queries of model classes with literal `modifiers`.
 */
type KnownModifiers<QB> = ClassModifiers<QueryClass<QB>> & RegisteredModifiers<QB>;

// The model class that started the query, if any.
type QueryClass<QB> = [QB] extends [never]
  ? never
  : QB extends { ExtraType: QueryExtra<infer C> }
    ? unknown extends C
      ? never
      : C
    : never;

type ClassModifiers<C> = C extends { modifiers: infer O } ? O : {};

type ClassMappings<C> = C extends { relationMappings: infer T }
  ? T extends () => infer R
    ? R
    : T
  : {};

type RegisteredModifiers<QB> = [QB] extends [never]
  ? {}
  : QB extends { ExtraType: { registered: infer P } }
    ? P
    : {};

// Modifiers with their general type, e.g. inherited from `Model`, aren't
// checked.
type ChecksModifiers<QB extends AnyQueryBuilder> = IfStrict<
  false,
  HasQueryClass<QB> extends true ? ChecksClassModifiers<ClassModifiers<QueryClass<QB>>> : false
>;

type ChecksClassModifiers<O> = string extends keyof O ? false : true;

// The names that `modify()` takes on query builder QB, also in lists. Names
// in variables typed `string` are rejected where they are checked.
type ModifierName<QB extends AnyQueryBuilder> =
  ChecksModifiers<QB> extends true ? keyof KnownModifiers<QB> & string : string;

type ModifyArg<QB extends AnyQueryBuilder> =
  | ModifierName<QB>
  | ModifierName<QB>[]
  | ModifierFunction<QB>
  | Record<string, Expression<PrimitiveValue>>;

// The related classes are found through the relation mappings, at each step
// of the path. P are the names registered with `modifiers()`.
type UnknownModifiers<Mappings, T, P> = T extends unknown
  ? {
      [K in keyof T & string]: T[K] extends { names: infer N; children: infer Children }
        ? MappedClass<Mappings, K> extends infer C
          ? [C] extends [never]
            ? never
            : | (ChecksClassModifiers<ClassModifiers<C>> extends true
                  ? Exclude<N, keyof ClassModifiers<C> | P>
                  : never)
              | UnknownModifiers<ClassMappings<C>, Children, P>
          : never
        : never;
    }[keyof T & string]
  : never;

// Mappings with their general type, e.g. inherited from `Model`, give no class.
type MappedClass<Mappings, K> = string extends keyof Mappings
  ? never
  : K extends keyof Mappings
    ? Mappings[K] extends { modelClass: infer C }
      ? C extends abstract new (...args: any) => any
        ? C
        : C extends () => infer RC
          ? RC
          : never
      : never
    : never;

/**
 * Parses the modifiers of relation expressions into a tree of the relations
 * with their modifier names: 'pets(a, b).owner' ->
 * `{ pets: { names: 'a' | 'b', children: { owner: ... } } }`. It is separate
 * from `ParseRelationExpression`, so that the narrowing types don't carry the
 * names.
 */
type ParseModifierExpression<E> = string extends E
  ? {}
  : E extends string
    ? ParseModifierString<E>
    : ParseModifierObject<E>;

// A union of the trees of the list items, as they can name the same relation.
type ParseModifierList<L extends string[], Acc = never> = L extends [
  infer H extends string,
  ...infer T extends string[],
]
  ? ParseModifierList<T, Acc | ParseModifierString<H>>
  : Acc;

type ParseModifierString<S extends string> =
  Trim<S> extends `[${infer Inner}]`
    ? ParseModifierList<SplitList<Inner>>
    : Trim<S> extends `${infer Head}.${infer Rest}`
      ? IsBalanced<Head> extends true
        ? ModifierNode<Head, ParseModifierString<Rest>>
        : {}
      : ModifierNode<S, {}>;

type ModifierNode<S extends string, Children> = [RelationName<S>] extends [never]
  ? {}
  : { [K in RelationName<S>]: { names: ModifierNames<S>; children: Children } };

// Empty arguments, e.g. of 'pets()' or a trailing comma, are no names.
type ModifierNames<S extends string> =
  Trim<S> extends `${string}(${infer Args})` ? Exclude<Trim<SplitList<Args>[number]>, ''> : never;

type ParseModifierObject<E> = string extends keyof E
  ? {}
  : {
      [
        K in keyof E as K extends `$${string}`
          ? never
          : false extends E[K]
            ? never
            : E[K] extends { $relation: any }
              ? never
              : K
      ]: {
        names: E[K] extends { $modify: infer N }
          ? N extends readonly (infer I extends string)[]
            ? I
            : N extends string
              ? N
              : never
          : never;
        children: E[K] extends object ? ParseModifierObject<E[K]> : {};
      };
    };

export interface ForClassMethod {
  <M extends Model>(modelClass: ModelConstructor<M>): QueryBuilderType<M>;
}

/**
 * https://ditojs.github.io/objection/api/types/#type-fieldexpression
 */
export type FieldExpression = string;

export type JsonObjectOrFieldExpression = object | object[] | FieldExpression;

export type Selection<QB extends AnyQueryBuilder> = ColumnRef | AnyQueryBuilder | CallbackVoid<QB>;

export interface SelectMethod<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB>(...columns: IfStrict<ModelProps<ModelType<QBP>>, never>[]): QB;
  <QBP extends QB>(columns: IfStrict<ModelProps<ModelType<QBP>>, never>[]): QB;

  <QBP extends QB>(...columns: IfStrict<Selection<QBP>, never>[]): QB;
  <QBP extends QB>(columns: IfStrict<Selection<QBP>, never>[]): QB;

  // Allows things like `select(1)`, not sure if we should be more specific here?
  <QBP extends QB>(...args: IfStrict<any, never>[]): QB;

  <QBP extends QB, const C extends readonly unknown[] = []>(
    ...columns: StrictSelections<ModelType<QBP>, C>
  ): SelectQueryBuilder<QBP, C>;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    columns: StrictSelections<ModelType<QBP>, C>,
  ): SelectQueryBuilder<QBP, C>;
}

export interface AsMethod<out QB extends AnyQueryBuilder> {
  (alias: string): QB;
}

export interface FromMethod<out QB extends AnyQueryBuilder> {
  (table: TableRef<QB>, options?: { only?: boolean }): QB;
}

export interface FromRawMethod<out QB extends AnyQueryBuilder> extends RawInterface<QB> {}

export interface JsonExtraction {
  column: string | Raw | Knex.QueryBuilder;
  path: string;
  alias?: string;
  singleValue?: boolean;
}

// Extractions without an alias, or with several, add any properties.
export interface JsonExtract<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never, const A extends string = string>(
    column: ColumnArg<ModelType<QBP>, C>,
    path: string,
    alias?: A,
    singleValue?: boolean,
  ): JsonExtractQueryBuilder<QBP, A>;

  <QBP extends QB, const A extends string = string>(
    column: RefArg<QBP>,
    path: string,
    alias?: A,
    singleValue?: boolean,
  ): JsonExtractQueryBuilder<QBP, A>;
  <QBP extends QB>(
    column: JsonExtraction[] | any[][],
    singleValue?: boolean,
  ): JsonExtractQueryBuilder<QBP, string>;
}

export interface JsonSet<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never>(
    column: ColumnArg<ModelType<QBP>, C>,
    path: string,
    value: any,
    alias?: string,
  ): QB;

  (column: RefArg<QB>, path: string, value: any, alias?: string): QB;
}

export interface JsonInsert<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never>(
    column: ColumnArg<ModelType<QBP>, C>,
    path: string,
    value: any,
    alias?: string,
  ): QB;

  (column: RefArg<QB>, path: string, value: any, alias?: string): QB;
}

export interface JsonRemove<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never>(
    column: ColumnArg<ModelType<QBP>, C>,
    path: string,
    alias?: string,
  ): QB;

  (column: RefArg<QB>, path: string, alias?: string): QB;
}

export interface WhereMethod<out QB extends AnyQueryBuilder> {
  (condition: boolean): QB;
  (cb: CallbackVoid<QB>): QB;
  (raw: Raw): QB;
  <QBA extends AnyQueryBuilder>(qb: QBA): QB;

  (col: RefArg<QB>, op: Operator, expr: Expression<PrimitiveValue>): QB;
  (col: RefArg<QB>, expr: Expression<PrimitiveValue>): QB;

  // The column overloads come last, so that errors are reported for them.
  <QBP extends QB, const C extends string = never, const O extends Operator = Operator>(
    col: ColumnArg<ModelType<QBP>, C>,
    op: O,
    expr: OperatorValueArg<ModelType<QBP>, C, O>,
  ): QB;
  <QBP extends QB, const C extends string = never>(
    col: ColumnArg<ModelType<QBP>, C>,
    expr: ValueArg<ModelType<QBP>, C>,
  ): QB;

  <QBP extends QB>(obj: IfStrict<PartialModelProps<ModelType<QBP>>, never>): QB;
  // We must allow any keys in the object. The previous type
  // is kind of useless, but maybe one day vscode and other
  // tools can autocomplete using it.
  (obj: IfStrict<object, never>): QB;
  <QBP extends QB, const O extends object = {}>(obj: O & StrictWhereObject<ModelType<QBP>, O>): QB;
}

export interface WhereLikeMethod<out QB extends AnyQueryBuilder> {
  (col: RefArg<QB>, expr: Expression<string>): QB;
  <QBP extends QB, const C extends string = never>(
    col: ColumnArg<ModelType<QBP>, C>,
    expr: Expression<string>,
  ): QB;
}

export interface WhereRawMethod<out QB extends AnyQueryBuilder> extends RawInterface<QB> {}

export interface WhereWrappedMethod<out QB extends AnyQueryBuilder> {
  (cb: CallbackVoid<QB>): QB;
}

export interface WhereExistsMethod<out QB extends AnyQueryBuilder> {
  (cb: CallbackVoid<QB>): QB;
  (raw: Raw): QB;
  <QBA extends AnyQueryBuilder>(qb: QBA): QB;
}

export interface WhereInMethod<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB>(
    col: IfStrict<ModelProps<ModelType<QBP>>, never>,
    expr: Expression<PrimitiveValue>,
  ): QB;
  <QBP extends QB>(col: IfStrict<ModelProps<ModelType<QBP>>, never>, cb: CallbackVoid<QB>): QB;
  <QBP extends QB>(col: IfStrict<ModelProps<ModelType<QBP>>, never>, qb: AnyQueryBuilder): QB;

  (col: RefArg<QB> | RefArg<QB>[], expr: readonly Expression<PrimitiveValue>[]): QB;
  (col: RefArg<QB> | RefArg<QB>[], cb: CallbackVoid<QB>): QB;
  (col: RefArg<QB> | RefArg<QB>[], qb: AnyQueryBuilder): QB;

  <QBP extends QB, const C extends string = never>(
    col: StrictColumn<ModelType<QBP>, C>,
    expr: readonly ValueArg<ModelType<QBP>, C>[] | Raw | AnyQueryBuilder | CallbackVoid<QB>,
  ): QB;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    col: StrictColumns<ModelType<QBP>, C>,
    expr: readonly Expression<PrimitiveValue>[] | Raw | AnyQueryBuilder | CallbackVoid<QB>,
  ): QB;
}

export interface WhereBetweenMethod<out QB extends AnyQueryBuilder> {
  (column: RefArg<QB>, range: [Expression<PrimitiveValue>, Expression<PrimitiveValue>]): QB;
  <QBP extends QB, const C extends string = never>(
    column: StrictColumn<ModelType<QBP>, C>,
    range: [ValueArg<ModelType<QBP>, C>, ValueArg<ModelType<QBP>, C>],
  ): QB;
}

export interface WhereNullMethod<out QB extends AnyQueryBuilder> {
  (column: RefArg<QB>): QB;
  <QBP extends QB, const C extends string = never>(column: StrictColumn<ModelType<QBP>, C>): QB;
}

export interface WhereColumnMethod<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never, const D extends string = never>(
    col1: ColumnArg<ModelType<QBP>, C>,
    op: Operator,
    col2: RefArg<QB> | StrictColumn<ModelType<QBP>, D>,
  ): QB;
  <QBP extends QB, const C extends string = never, const D extends string = never>(
    col1: ColumnArg<ModelType<QBP>, C>,
    col2: RefArg<QB> | StrictColumn<ModelType<QBP>, D>,
  ): QB;

  <QBP extends QB, const D extends string = never>(
    col1: RefArg<QB>,
    op: Operator,
    col2: RefArg<QB> | StrictColumn<ModelType<QBP>, D>,
  ): QB;
  <QBP extends QB, const D extends string = never>(
    col1: RefArg<QB>,
    col2: RefArg<QB> | StrictColumn<ModelType<QBP>, D>,
  ): QB;
}

export interface WhereJsonObject<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never>(
    col: ColumnArg<ModelType<QBP>, C>,
    value: any,
  ): QB;

  (col: RefArg<QB>, value: any): QB;
}

export interface WhereJsonPath<out QB extends AnyQueryBuilder> {
  // These must come first so that we get autocomplete.
  <QBP extends QB, const C extends string = never>(
    col: ColumnArg<ModelType<QBP>, C>,
    jsonPath: string,
    operator: string,
    value: any,
  ): QB;

  (col: RefArg<QB>, jsonPath: string, operator: string, value: any): QB;
}

/**
 * Field expressions, checked in strict mode.
 */
type FieldExpressionArg<M, C extends string> = IfStrict<
  FieldExpression,
  StrictFieldExpression<M, C>
>;

export interface WhereJsonMethod<out QB extends AnyQueryBuilder> {
  <QBP extends QB, const C extends string = never>(
    fieldExpression: FieldExpressionArg<ModelType<QBP>, C>,
    jsonObjectOrFieldExpression: JsonObjectOrFieldExpression,
  ): QB;
}

export interface WhereFieldExpressionMethod<out QB extends AnyQueryBuilder> {
  <QBP extends QB, const C extends string = never>(
    fieldExpression: FieldExpressionArg<ModelType<QBP>, C>,
  ): QB;
}

export interface WhereJsonExpressionMethod<out QB extends AnyQueryBuilder> {
  <QBP extends QB, const C extends string = never>(
    fieldExpression: FieldExpressionArg<ModelType<QBP>, C>,
    keys: string | string[],
  ): QB;
}

export interface WhereJsonField<out QB extends AnyQueryBuilder> {
  <QBP extends QB, const C extends string = never>(
    fieldExpression: FieldExpressionArg<ModelType<QBP>, C>,
    operator: string,
    value: boolean | number | string | null,
  ): QB;
}

export interface WhereCompositeMethod<out QB extends AnyQueryBuilder> {
  (column: RefArg<QB>[], op: Operator, expr: readonly Expression<PrimitiveValue>[]): QB;
  (column: RefArg<QB>, expr: Expression<PrimitiveValue>): QB;
  (column: RefArg<QB>, op: Operator, expr: Expression<PrimitiveValue>): QB;
  (column: RefArg<QB>[], expr: readonly Expression<PrimitiveValue>[]): QB;
  (column: RefArg<QB>[], qb: AnyQueryBuilder): QB;

  <QBP extends QB, const C extends readonly unknown[] = []>(
    column: StrictColumns<ModelType<QBP>, C>,
    op: Operator,
    expr: readonly Expression<PrimitiveValue>[],
  ): QB;
  <QBP extends QB, const C extends string = never>(
    column: StrictColumn<ModelType<QBP>, C>,
    expr: ValueArg<ModelType<QBP>, C>,
  ): QB;
  <QBP extends QB, const C extends string = never, const O extends Operator = Operator>(
    column: StrictColumn<ModelType<QBP>, C>,
    op: O,
    expr: OperatorValueArg<ModelType<QBP>, C, O>,
  ): QB;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    column: StrictColumns<ModelType<QBP>, C>,
    expr: readonly Expression<PrimitiveValue>[] | AnyQueryBuilder,
  ): QB;
}

export interface WhereInCompositeMethod<out QB extends AnyQueryBuilder> {
  (column: RefArg<QB>, expr: readonly Expression<PrimitiveValue>[]): QB;
  (column: RefArg<QB>, qb: AnyQueryBuilder): QB;
  (column: RefArg<QB>[], expr: readonly Expression<PrimitiveValue>[][]): QB;
  (column: RefArg<QB>[], qb: AnyQueryBuilder): QB;

  <QBP extends QB, const C extends string = never>(
    column: StrictColumn<ModelType<QBP>, C>,
    expr: readonly ValueArg<ModelType<QBP>, C>[] | AnyQueryBuilder,
  ): QB;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    column: StrictColumns<ModelType<QBP>, C>,
    expr: readonly (readonly Expression<PrimitiveValue>[])[] | AnyQueryBuilder,
  ): QB;
}

export type QBOrCallback<QB extends AnyQueryBuilder> = AnyQueryBuilder | CallbackVoid<QB>;

export interface BaseSetOperations<out QB extends AnyQueryBuilder> {
  (callbackOrBuilder: QBOrCallback<QB>, wrap?: boolean): QB;
  (callbacksOrBuilders: QBOrCallback<QB>[], wrap?: boolean): QB;
}

export interface SetOperationsMethod<out QB extends AnyQueryBuilder> extends BaseSetOperations<QB> {
  (...callbacksOrBuilders: QBOrCallback<QB>[]): QB;
}

export interface UnionMethod<out QB extends AnyQueryBuilder> extends BaseSetOperations<QB> {
  (arg1: QBOrCallback<QB>, wrap?: boolean): QB;
  (arg1: QBOrCallback<QB>, arg2: QBOrCallback<QB>, wrap?: boolean): QB;
  (arg1: QBOrCallback<QB>, arg2: QBOrCallback<QB>, arg3: QBOrCallback<QB>, wrap?: boolean): QB;
  (
    arg1: QBOrCallback<QB>,
    arg2: QBOrCallback<QB>,
    arg3: QBOrCallback<QB>,
    arg4: QBOrCallback<QB>,
    wrap?: boolean,
  ): QB;
  (
    arg1: QBOrCallback<QB>,
    arg2: QBOrCallback<QB>,
    arg3: QBOrCallback<QB>,
    arg4: QBOrCallback<QB>,
    arg5: QBOrCallback<QB>,
    wrap?: boolean,
  ): QB;
  (
    arg1: QBOrCallback<QB>,
    arg2: QBOrCallback<QB>,
    arg3: QBOrCallback<QB>,
    arg4: QBOrCallback<QB>,
    arg5: QBOrCallback<QB>,
    arg6: QBOrCallback<QB>,
    wrap?: boolean,
  ): QB;
  (
    arg1: QBOrCallback<QB>,
    arg2: QBOrCallback<QB>,
    arg3: QBOrCallback<QB>,
    arg4: QBOrCallback<QB>,
    arg5: QBOrCallback<QB>,
    arg6: QBOrCallback<QB>,
    arg7: QBOrCallback<QB>,
    wrap?: boolean,
  ): QB;
}

export interface WithMethod<out QB extends AnyQueryBuilder> {
  (alias: string, expr: CallbackVoid<QB> | AnyQueryBuilder | Raw): QB;
  (alias: string, columns: string[], expr: CallbackVoid<QB> | AnyQueryBuilder | Raw): QB;
}

export interface JoinRelatedOptions {
  alias?: string | boolean;
  aliases?: Record<string, string>;
}

export interface JoinRelatedMethod<out QB extends AnyQueryBuilder> {
  <QBP extends QB, const E extends RelationExpression<ModelType<QBP>> = never>(
    expr: E & CheckRelationExpression<ModelType<QBP>, E, QBP>,
    opt?: JoinRelatedOptions,
  ): QB;
}

export interface JoinMethod<out QB extends AnyQueryBuilder> {
  (table: TableRef<QB>, leftCol: ColumnRef, op: Operator, rightCol: ColumnRef): QB;
  (table: TableRef<QB>, leftCol: ColumnRef, rightCol: ColumnRef): QB;
  (table: TableRef<QB>, cb: CallbackVoid<Knex.JoinClause>): QB;
  (table: TableRef<QB>, columns: { [leftCol: string]: ColumnRef }): QB;
  (table: TableRef<QB>, raw: Raw): QB;
  (raw: Raw): QB;
}

export interface JoinRawMethod<out QB extends AnyQueryBuilder> extends RawInterface<QB> {}

export interface IncrementDecrementMethod<out QB extends AnyQueryBuilder> {
  (column: IfStrict<string, never>, amount?: number): QB;
  <QBP extends QB, const C extends string = never>(
    column: StrictColumn<ModelType<QBP>, C>,
    amount?: number,
  ): QB;
}

export interface AggregateMethod<
  out QB extends AnyQueryBuilder,
  V extends AggregateValue = 'column',
> {
  (column: RefArg<QB>): QB;
  (aliasToColumnDict: IfStrict<{ [alias: string]: ColumnRef }, never>): QB;
  <QBP extends QB, const C extends string = never>(
    column: StrictAggregation<ModelType<QBP>, C>,
  ): AggregateQueryBuilder<QBP, C, V>;
  <QBP extends QB, const O extends object = {}>(
    aliasToColumnDict: O & IfStrict<never, StrictSelectionObject<ModelType<QBP>, O>>,
  ): AggregateQueryBuilder<QBP, O, V>;
}

export interface CountMethod<out QB extends AnyQueryBuilder> {
  (column?: RefArg<QB>, options?: { as: string }): AggregateQueryBuilder<QB, string, 'number'>;
  (aliasToColumnDict: IfStrict<{ [alias: string]: string | string[] }, never>): QB;
  (...columns: RefArg<QB>[]): AggregateQueryBuilder<QB, string, 'number'>;
  <QBP extends QB, const C extends string = never, const A extends string = never>(
    column: StrictAggregation<ModelType<QBP>, C>,
    options?: { as: A },
  ): AggregateQueryBuilder<QBP, C, 'number', A>;
  <QBP extends QB, const O extends object = {}>(
    aliasToColumnDict: O & IfStrict<never, StrictSelectionObject<ModelType<QBP>, O>>,
  ): AggregateQueryBuilder<QBP, O, 'number'>;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    ...columns: StrictSelections<ModelType<QBP>, C>
  ): AggregateQueryBuilder<QBP, C, 'number'>;
}

/**
 * Aggregations: '*', columns and 'column as alias', checked in strict mode.
 */
type StrictAggregation<M, C extends string> = IfStrict<never, CheckedSelection<M, C>>;

export interface GroupByMethod<out QB extends AnyQueryBuilder> {
  (...columns: RefArg<QB>[]): QB;
  (columns: RefArg<QB>[]): QB;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    ...columns: StrictColumns<ModelType<QBP>, C>
  ): QB;
  <QBP extends QB, const C extends readonly unknown[] = []>(
    columns: StrictColumns<ModelType<QBP>, C>,
  ): QB;
}

export interface OrderByDescriptor {
  column: ColumnRef;
  order?: OrderByDirection;
  nulls?: OrderByNulls;
}

export type ColumnRefOrOrderByDescriptor = ColumnRef | OrderByDescriptor;

type StrictOrderBy<QB extends AnyQueryBuilder, C extends readonly unknown[]> = IfStrict<
  never,
  {
    [I in keyof C]: C[I] extends string
      ? StrictOutputColumn<QB, C[I]>
      : C[I] extends { column: infer D extends string }
        ? Omit<OrderByDescriptor, 'column'> & { column: StrictOutputColumn<QB, D> }
        : C[I] extends Raw | ReferenceBuilder | OrderByDescriptor
          ? C[I]
          : never;
  }
>;

export interface OrderByMethod<out QB extends AnyQueryBuilder> {
  (column: RefArg<QB>, order?: OrderByDirection, nulls?: OrderByNulls): QB;
  (columns: IfStrict<ColumnRefOrOrderByDescriptor[], never>): QB;
  <QBP extends QB, const C extends string = never>(
    column: StrictOutputColumn<QBP, C>,
    order?: OrderByDirection,
    nulls?: OrderByNulls,
  ): QB;
  <QBP extends QB, const C extends readonly unknown[] = []>(columns: StrictOrderBy<QBP, C>): QB;
}

export interface OrderByRawMethod<out QB extends AnyQueryBuilder> extends RawInterface<QB> {}

export interface FirstMethod {
  <QB extends AnyQueryBuilder>(
    this: QB,
  ): [ResultType<QB>] extends [any[]] ? MaybeSingleQueryBuilder<QB> : QB;
}

export type ForIdValue = MaybeCompositeId | AnyQueryBuilder;

export interface AllowGraphMethod<out QB extends AnyQueryBuilder> {
  (expr: RelationExpression<ModelType<QB>>): QB;
}

export interface IdentityMethod<out QB extends AnyQueryBuilder> {
  (): QB;
}

export interface OneArgMethod<T, QB extends AnyQueryBuilder> {
  (arg: T): QB;
}

export interface StringReturningMethod {
  (): string;
}

export interface BooleanReturningMethod {
  (): boolean;
}

export interface HasMethod {
  (selector: string | RegExp): boolean;
}

export interface ClearSelectMethod<out QB extends AnyQueryBuilder> {
  <QBP extends QB>(): ClearSelectQueryBuilder<QBP>;
}

export interface ClearMethod<out QB extends AnyQueryBuilder> {
  (selector: string | RegExp): QB;
}

export interface ColumnInfoMethod<out QB extends AnyQueryBuilder> {
  (): Promise<Knex.ColumnInfo>;
}

export interface TableRefForMethod {
  (modelClassOrTableName: string | AnyModelConstructor): string;
}

export interface AliasForMethod<out QB extends AnyQueryBuilder> {
  (modelClassOrTableName: string | AnyModelConstructor): string | null;
  (modelClassOrTableName: string | AnyModelConstructor, alias: string): QB;
}

export interface ModelClassMethod<M extends Model> {
  (): ModelClass<M>;
}

export interface ReturningOptions {
  includeTriggerModifications?: boolean;
}

export type ReturningColumn = string | Raw | readonly (string | Raw)[];

/**
 * The arguments of `returning()`: any number of columns or column arrays,
 * optionally followed by an options object.
 */
export type ReturningArgs =
  ReturningColumn[] | [ReturningColumn, ...ReturningColumn[], ReturningOptions | undefined];

/**
 * With `returning()`, `relate()` returns the inserted join rows for
 * many-to-many relations, the updated related rows for has-many relations
 * and the updated owner rows for belongs-to-one relations. MySQL has no
 * `returning`: there, many-to-many relations return the join rows built from
 * the input, without columns generated by the database, and the other
 * relations still return the number of affected rows. The typings can't tell
 * these apart, so the rows are typed as plain objects.
 */
export interface RelateReturningMethod<M extends Model> {
  (...args: ReturningArgs): QueryBuilder<M, Pojo[]>;
}

/**
 * The query builder QB with result R after `patch()`, `update()` or `delete()`.
 * With `returning()` it resolves to the written rows in the result kind of QB:
 * one row for single and maybe-single query builders, e.g. after `findById()`,
 * `first()`, `$query()` or `$relatedQuery()` of a to-one relation, an array
 * otherwise.
 */
type WriteQueryBuilder<QB extends AnyQueryBuilder, M extends Model, R> = [R] extends [
  readonly unknown[] | Page<unknown> | number,
]
  ? Rebind<QB, M, number>
  : { returning(...args: ReturningArgs): Rebind<QB, M, WrittenRows<M, R>> } & Rebind<QB, M, number>;

/**
 * The writes after `returning()` on single and maybe-single query builders,
 * which resolve to one row.
 */
interface ReturningWrites<QB extends AnyQueryBuilder, M extends Model, W> {
  update(update: PartialModelRow<M>): Rebind<QB, M, W>;
  update(): Rebind<QB, M, W>;
  patch(update: PartialModelPatch<M>): Rebind<QB, M, W>;
  patch(): Rebind<QB, M, W>;
  del(): Rebind<QB, M, W>;
  delete(): Rebind<QB, M, W>;
}

type WrittenRows<M, R> = undefined extends R ? M | undefined : M;

export type RelateQueryBuilder<NQB extends AnyQueryBuilder> = {
  returning: RelateReturningMethod<ModelType<NQB>>;
} & NQB;

export interface TimeoutOptions {
  cancel: boolean;
}

export interface TimeoutMethod<out QB extends AnyQueryBuilder> {
  (ms: number, options?: TimeoutOptions): QB;
}

export interface Page<M> {
  total: number;
  results: M[];
}

export interface RunBeforeCallback<QB extends AnyQueryBuilder> {
  (this: QB, result: any, query: QB): any;
}

export interface RunBeforeMethod<out QB extends AnyQueryBuilder> {
  (cb: RunBeforeCallback<QB>): QB;
}

export interface RunAfterCallback<QB extends AnyQueryBuilder> {
  (this: QB, result: ResultType<QB>, query: QB): any;
}

export interface RunAfterMethod<out QB extends AnyQueryBuilder> {
  (cb: RunAfterCallback<QB>): QB;
}

export interface OnBuildMethod<out QB extends AnyQueryBuilder> {
  (cb: CallbackVoid<QB>): QB;
}

export interface OnBuildKnexCallback<QB extends AnyQueryBuilder> {
  (this: QB, knexQuery: Knex.QueryBuilder, query: QB): void;
}

export interface OnBuildKnexMethod<out QB extends AnyQueryBuilder> {
  (cb: OnBuildKnexCallback<QB>): QB;
}

export interface OnErrorCallback<QB extends AnyQueryBuilder> {
  (this: QB, error: Error, query: QB): any;
}

export interface OnErrorMethod<out QB extends AnyQueryBuilder> {
  (cb: OnErrorCallback<QB>): QB;
}

export interface InsertGraphOptions {
  relate?: boolean | string | string[];
  noRelate?: boolean | string | string[];
  noInsert?: boolean | string | string[];
  allowRefs?: boolean;
}

export interface InsertGraphMethod<M extends Model> {
  <QB extends AnyQueryBuilder>(
    this: QB,
    graph: PartialModelGraph<M>,
    options?: InsertGraphOptions,
  ): SingleQueryBuilder<QB>;

  <QB extends AnyQueryBuilder>(
    this: QB,
    graph: PartialModelGraph<M>[],
    options?: InsertGraphOptions,
  ): ArrayQueryBuilder<QB>;
}

export interface UpsertGraphOptions {
  relate?: boolean | string | string[];
  unrelate?: boolean | string | string[];
  insertMissing?: boolean | string | string[];
  update?: boolean | string | string[];
  noInsert?: boolean | string | string[];
  noUpdate?: boolean | string | string[];
  noDelete?: boolean | string | string[];
  noRelate?: boolean | string | string[];
  noUnrelate?: boolean | string | string[];
  allowRefs?: boolean;
  allowMarkers?: boolean;
}

export interface UpsertGraphMethod<M extends Model> {
  <QB extends AnyQueryBuilder>(
    this: QB,
    graph: PartialModelGraph<M>[],
    options?: UpsertGraphOptions,
  ): ArrayQueryBuilder<QB>;

  <QB extends AnyQueryBuilder>(
    this: QB,
    graph: PartialModelGraph<M>,
    options?: UpsertGraphOptions,
  ): SingleQueryBuilder<QB>;
}

export interface GraphExpressionObjectMethod<out QB extends AnyQueryBuilder> {
  (): any;
}

export interface GraphOptions {
  minimize?: boolean;
  separator?: string;
  aliases?: { [key: string]: string };
  joinOperation?: string;
  maxBatchSize?: number;
  /**
   * Apply `limit()`, `offset()` and `first()` in graph modifiers to the related
   * items of each parent. Defaults to `true`. Only applies to `withGraphFetched()`.
   */
  limitPerParent?: boolean;
}

export interface WithGraphOptions extends GraphOptions {
  algorithm?: 'fetch' | 'join';
}

export interface ModifyGraphMethod<out QB extends AnyQueryBuilder> {
  <M extends Model>(
    expr: RelationExpression<ModelType<QB>>,
    modifier: Modifier<QueryBuilderType<M>>,
  ): QB;
}

export interface JoinAliases {
  owner: string;
  related: string;
  /** The alias of the join table of a `ManyToManyRelation` or `HasOneThroughRelation`. */
  joinTable?: string;
}

export interface ModifyJoinMethod<out QB extends AnyQueryBuilder> {
  (
    expr: RelationExpression<ModelType<QB>>,
    modifier: (join: Knex.JoinClause, aliases: JoinAliases) => void,
  ): QB;
}

export interface ContextMethod<out QB extends AnyQueryBuilder> {
  (context: object): QB;
  (): QueryContext;
}

export interface ClearContextMethod<out QB extends AnyQueryBuilder> {
  (): QB;
}

export interface ModifyMethod<out QB extends AnyQueryBuilder> {
  (modifier: ModifyArg<QB> | ModifyArg<QB>[], ...args: any[]): QB;
}

// Registered modifiers add up, on queries with and without a model class.
type RegisterModifiers<X, O> =
  X extends QueryExtra<infer C, infer P> ? QueryExtra<C, P & O> : QueryExtra<unknown, O>;

export interface ModifiersMethod<
  out QB extends AnyQueryBuilder,
  M extends Model = ModelType<QB>,
  R = ResultType<QB>,
  X = ExtraType<QB>,
> {
  <const O extends Modifiers>(
    modifiers: O,
  ): IfStrict<QB, Rebind<QB, M, R, RegisterModifiers<X, O>>>;
  (): QB;
}

export interface Pojo {
  [key: string]: any;
}

export interface CatchablePromiseLike<R> extends PromiseLike<R> {
  catch<FR = never>(
    onrejected?: ((reason: any) => FR | PromiseLike<FR>) | undefined | null,
  ): Promise<R | FR>;
}

export class QueryBuilder<
  M extends Model,
  R = M[],
  X = unknown,
> implements CatchablePromiseLike<R> {
  static forClass: ForClassMethod;

  constructor(modelClass: ModelConstructor<M>);

  select: SelectMethod<this>;
  columns: SelectMethod<this>;
  column: SelectMethod<this>;
  distinct: SelectMethod<this>;
  // distinctOn() takes columns like groupBy(), and doesn't select them.
  distinctOn: GroupByMethod<this>;
  as: AsMethod<this>;

  from: FromMethod<this>;
  table: FromMethod<this>;
  into: FromMethod<this>;
  fromRaw: FromRawMethod<this>;

  jsonExtract: JsonExtract<this>;
  jsonSet: JsonSet<this>;
  jsonInsert: JsonInsert<this>;
  jsonRemove: JsonRemove<this>;

  where: WhereMethod<this>;
  andWhere: WhereMethod<this>;
  orWhere: WhereMethod<this>;
  whereNot: WhereMethod<this>;
  andWhereNot: WhereMethod<this>;
  orWhereNot: WhereMethod<this>;
  whereLike: IfStrict<WhereMethod<this>, WhereLikeMethod<this>>;
  andWhereLike: IfStrict<WhereMethod<this>, WhereLikeMethod<this>>;
  orWhereLike: IfStrict<WhereMethod<this>, WhereLikeMethod<this>>;
  whereILike: IfStrict<WhereMethod<this>, WhereLikeMethod<this>>;
  andWhereILike: IfStrict<WhereMethod<this>, WhereLikeMethod<this>>;
  orWhereILike: IfStrict<WhereMethod<this>, WhereLikeMethod<this>>;

  whereRaw: WhereRawMethod<this>;
  orWhereRaw: WhereRawMethod<this>;
  andWhereRaw: WhereRawMethod<this>;

  whereWrapped: WhereWrappedMethod<this>;
  havingWrapped: WhereWrappedMethod<this>;

  whereExists: WhereExistsMethod<this>;
  orWhereExists: WhereExistsMethod<this>;
  whereNotExists: WhereExistsMethod<this>;
  orWhereNotExists: WhereExistsMethod<this>;

  whereIn: WhereInMethod<this>;
  orWhereIn: WhereInMethod<this>;
  whereNotIn: WhereInMethod<this>;
  orWhereNotIn: WhereInMethod<this>;

  whereBetween: WhereBetweenMethod<this>;
  orWhereBetween: WhereBetweenMethod<this>;
  andWhereBetween: WhereBetweenMethod<this>;
  whereNotBetween: WhereBetweenMethod<this>;
  orWhereNotBetween: WhereBetweenMethod<this>;
  andWhereNotBetween: WhereBetweenMethod<this>;

  whereNull: WhereNullMethod<this>;
  orWhereNull: WhereNullMethod<this>;
  whereNotNull: WhereNullMethod<this>;
  orWhereNotNull: WhereNullMethod<this>;

  whereColumn: WhereColumnMethod<this>;
  orWhereColumn: WhereColumnMethod<this>;
  andWhereColumn: WhereColumnMethod<this>;
  whereNotColumn: WhereColumnMethod<this>;
  orWhereNotColumn: WhereColumnMethod<this>;
  andWhereNotColumn: WhereColumnMethod<this>;

  whereJsonObject: WhereJsonObject<this>;
  orWhereJsonObject: WhereJsonObject<this>;
  andWhereJsonObject: WhereJsonObject<this>;
  whereNotJsonObject: WhereJsonObject<this>;
  orWhereNotJsonObject: WhereJsonObject<this>;
  andWhereNotJsonObject: WhereJsonObject<this>;

  whereJsonPath: WhereJsonPath<this>;
  orWhereJsonPath: WhereJsonPath<this>;
  andWhereJsonPath: WhereJsonPath<this>;

  whereJsonSupersetOf: WhereJsonMethod<this>;
  andWhereJsonSupersetOf: WhereJsonMethod<this>;
  orWhereJsonSupersetOf: WhereJsonMethod<this>;
  whereJsonNotSupersetOf: WhereJsonMethod<this>;
  andWhereJsonNotSupersetOf: WhereJsonMethod<this>;
  orWhereJsonNotSupersetOf: WhereJsonMethod<this>;
  whereJsonSubsetOf: WhereJsonMethod<this>;
  andWhereJsonSubsetOf: WhereJsonMethod<this>;
  orWhereJsonSubsetOf: WhereJsonMethod<this>;
  whereJsonNotSubsetOf: WhereJsonMethod<this>;
  andWhereJsonNotSubsetOf: WhereJsonMethod<this>;
  orWhereJsonNotSubsetOf: WhereJsonMethod<this>;
  whereJsonIsArray: WhereFieldExpressionMethod<this>;
  orWhereJsonIsArray: WhereFieldExpressionMethod<this>;
  whereJsonNotArray: WhereFieldExpressionMethod<this>;
  orWhereJsonNotArray: WhereFieldExpressionMethod<this>;
  whereJsonIsObject: WhereFieldExpressionMethod<this>;
  orWhereJsonIsObject: WhereFieldExpressionMethod<this>;
  whereJsonNotObject: WhereFieldExpressionMethod<this>;
  orWhereJsonNotObject: WhereFieldExpressionMethod<this>;
  whereJsonHasAny: WhereJsonExpressionMethod<this>;
  orWhereJsonHasAny: WhereJsonExpressionMethod<this>;
  whereJsonHasAll: WhereJsonExpressionMethod<this>;
  orWhereJsonHasAll: WhereJsonExpressionMethod<this>;

  having: WhereMethod<this>;
  andHaving: WhereMethod<this>;
  orHaving: WhereMethod<this>;

  havingRaw: WhereRawMethod<this>;
  orHavingRaw: WhereRawMethod<this>;

  havingIn: WhereInMethod<this>;
  orHavingIn: WhereInMethod<this>;
  havingNotIn: WhereInMethod<this>;
  orHavingNotIn: WhereInMethod<this>;

  havingNull: WhereNullMethod<this>;
  orHavingNull: WhereNullMethod<this>;
  havingNotNull: WhereNullMethod<this>;
  orHavingNotNull: WhereNullMethod<this>;

  havingExists: WhereExistsMethod<this>;
  orHavingExists: WhereExistsMethod<this>;
  havingNotExists: WhereExistsMethod<this>;
  orHavingNotExists: WhereExistsMethod<this>;

  havingBetween: WhereBetweenMethod<this>;
  orHavingBetween: WhereBetweenMethod<this>;
  havingNotBetween: WhereBetweenMethod<this>;
  orHavingNotBetween: WhereBetweenMethod<this>;

  whereComposite: WhereCompositeMethod<this>;
  whereInComposite: WhereInCompositeMethod<this>;
  whereNotInComposite: WhereInCompositeMethod<this>;

  union: UnionMethod<this>;
  unionAll: UnionMethod<this>;
  intersect: SetOperationsMethod<this>;
  except: SetOperationsMethod<this>;

  with: WithMethod<this>;
  withRecursive: WithMethod<this>;
  withWrapped: WithMethod<this>;
  withMaterialized: WithMethod<this>;
  withNotMaterialized: WithMethod<this>;

  joinRelated: JoinRelatedMethod<this>;
  innerJoinRelated: JoinRelatedMethod<this>;
  outerJoinRelated: JoinRelatedMethod<this>;
  leftJoinRelated: JoinRelatedMethod<this>;
  leftOuterJoinRelated: JoinRelatedMethod<this>;
  rightJoinRelated: JoinRelatedMethod<this>;
  rightOuterJoinRelated: JoinRelatedMethod<this>;
  fullOuterJoinRelated: JoinRelatedMethod<this>;

  join: JoinMethod<this>;
  joinRaw: JoinRawMethod<this>;
  innerJoin: JoinMethod<this>;
  leftJoin: JoinMethod<this>;
  leftOuterJoin: JoinMethod<this>;
  rightJoin: JoinMethod<this>;
  rightOuterJoin: JoinMethod<this>;
  outerJoin: JoinMethod<this>;
  fullOuterJoin: JoinMethod<this>;
  crossJoin: JoinMethod<this>;

  count: CountMethod<this>;
  countDistinct: CountMethod<this>;
  min: AggregateMethod<this>;
  max: AggregateMethod<this>;
  sum: AggregateMethod<this, 'number'>;
  sumDistinct: AggregateMethod<this, 'number'>;
  avg: AggregateMethod<this, 'number'>;
  avgDistinct: AggregateMethod<this, 'number'>;
  increment: IncrementDecrementMethod<this>;
  decrement: IncrementDecrementMethod<this>;
  first: FirstMethod;
  none: IdentityMethod<this>;

  orderBy: OrderByMethod<this>;
  orderByRaw: OrderByRawMethod<this>;

  groupBy: GroupByMethod<this>;
  groupByRaw: RawInterface<this>;

  findById(id: MaybeCompositeId): MaybeSingleQueryBuilder<this>;
  findByIds(ids: MaybeCompositeId[]): this;
  findOne: WhereMethod<MaybeSingleQueryBuilder<this>>;

  execute(): Promise<R>;
  castTo<MC extends Model>(modelClass: ModelConstructor<MC>): QueryBuilderType<MC>;
  castTo<R>(): QueryBuilder<M, R, X>;

  update(update: PartialModelRow<M>): NumberQueryBuilder<this>;
  update(): NumberQueryBuilder<this>;
  updateById(
    id: MaybeCompositeId,
    update: PartialModelRow<M>,
  ): NumberQueryBuilder<MaybeSingleQueryBuilder<this>>;
  updateAndFetch(update: PartialModelRow<M>): SingleQueryBuilder<this>;
  updateAndFetchById(id: MaybeCompositeId, update: PartialModelRow<M>): SingleQueryBuilder<this>;

  patch(update: PartialModelPatch<M>): NumberQueryBuilder<this>;
  patch(): NumberQueryBuilder<this>;
  patchById(
    id: MaybeCompositeId,
    update: PartialModelPatch<M>,
  ): NumberQueryBuilder<MaybeSingleQueryBuilder<this>>;
  patchAndFetch(update: PartialModelPatch<M>): SingleQueryBuilder<this>;
  patchAndFetchById(id: MaybeCompositeId, update: PartialModelPatch<M>): SingleQueryBuilder<this>;

  del(): NumberQueryBuilder<this>;
  delete(): NumberQueryBuilder<this>;
  deleteById(id: MaybeCompositeId): NumberQueryBuilder<MaybeSingleQueryBuilder<this>>;

  insert(insert: PartialModelRow<M>): SingleQueryBuilder<this>;
  insert(insert: PartialModelRow<M>[]): ArrayQueryBuilder<this>;
  insert(): SingleQueryBuilder<this>;

  onConflict(column?: ColumnRef | ColumnRef[] | true): this;
  ignore(): this;
  merge(merge?: PartialModelPatch<M> | string[]): this;

  insertAndFetch(insert: PartialModelRow<M>): SingleQueryBuilder<this>;
  insertAndFetch(insert: PartialModelRow<M>[]): ArrayQueryBuilder<this>;
  insertAndFetch(): SingleQueryBuilder<this>;

  relate(
    ids: MaybeCompositeId | MaybeCompositeId[] | PartialModelRow<M> | PartialModelRow<M>[],
  ): RelateQueryBuilder<NumberQueryBuilder<this>>;

  unrelate(): NumberQueryBuilder<this>;
  for(ids: ForIdValue | ForIdValue[]): this;

  // With literal relation expressions, the fetched relations become required
  // on the result type, see WithGraphQueryBuilder.
  withGraphFetched<const E extends RelationExpression<M>>(
    expr: E & CheckRelationExpression<M, E, this>,
    options?: GraphOptions,
  ): WithGraphQueryBuilder<this, E>;
  withGraphJoined<const E extends RelationExpression<M>>(
    expr: E & CheckRelationExpression<M, E, this>,
    options?: GraphOptions,
  ): WithGraphQueryBuilder<this, E>;
  withGraph<const E extends RelationExpression<M>>(
    expr: E & CheckRelationExpression<M, E, this>,
    options?: WithGraphOptions,
  ): WithGraphQueryBuilder<this, E>;

  truncate(): Promise<void>;
  allowGraph: AllowGraphMethod<this>;

  throwIfNotFound: (arg?: any) => R extends Model | undefined ? SingleQueryBuilder<this> : this;

  // With the class's own R, the result kind also resolves where `this` is
  // generic, e.g. in the methods of custom query builders. For `any` results
  // it's `any`, so that query builders with other results stay assignable to
  // AnyQueryBuilder and back.
  returning(
    ...args: ReturningArgs
  ): 0 extends 1 & R
    ? any
    : [R] extends [number]
      ? ArrayQueryBuilder<this>
      : [R] extends [readonly unknown[] | Page<unknown>]
        ? this
        : ReturningWrites<this, M, WrittenRows<M, R>> & this;
  forUpdate: IdentityMethod<this>;
  forShare: IdentityMethod<this>;
  forNoKeyUpdate: IdentityMethod<this>;
  forKeyShare: IdentityMethod<this>;
  skipLocked: IdentityMethod<this>;
  noWait: IdentityMethod<this>;
  debug: IdentityMethod<this>;
  alias: OneArgMethod<string, this>;
  aliasFor: AliasForMethod<this>;
  withSchema: OneArgMethod<string, this>;
  modelClass: ModelClassMethod<M>;
  tableNameFor: TableRefForMethod;
  tableRefFor: TableRefForMethod;
  tableName(): string;
  tableRef(): string;
  reject: OneArgMethod<any, this>;
  resolve: OneArgMethod<any, this>;
  transacting: OneArgMethod<TransactionOrKnex, this>;
  connection: OneArgMethod<TransactionOrKnex, this>;
  timeout: TimeoutMethod<this>;
  columnInfo: ColumnInfoMethod<this>;

  toKnexQuery<T extends {} = ModelObject<M>>(): Knex.QueryBuilder<T, T[]>;
  knex(knex?: Knex): Knex;
  clone(): this;
  emptyInstance(): this;

  page(page: number, pageSize: number): PageQueryBuilder<this>;
  range(): PageQueryBuilder<this>;
  range(start: number, end: number): PageQueryBuilder<this>;
  offset(offset: number, options?: boolean | { skipBinding?: boolean }): this;
  limit(limit: number, options?: boolean | { skipBinding?: boolean }): this;
  resultSize(): Promise<number>;

  runBefore: RunBeforeMethod<this>;
  runAfter: RunAfterMethod<this>;

  onBuild: OnBuildMethod<this>;
  onBuildKnex: OnBuildKnexMethod<this>;
  onError: OnErrorMethod<this>;

  insertGraph: InsertGraphMethod<M>;
  insertGraphAndFetch: InsertGraphMethod<M>;

  upsertGraph: UpsertGraphMethod<M>;
  upsertGraphAndFetch: UpsertGraphMethod<M>;

  graphExpressionObject: GraphExpressionObjectMethod<this>;

  modifyGraph: ModifyGraphMethod<this>;
  modifyJoin: ModifyJoinMethod<this>;

  context: ContextMethod<this>;
  clearContext: ClearContextMethod<this>;

  modify: ModifyMethod<this>;
  modifiers: ModifiersMethod<this, M, R, X>;

  isFind: BooleanReturningMethod;
  isExecutable: BooleanReturningMethod;
  isInsert: BooleanReturningMethod;
  isUpdate: BooleanReturningMethod;
  isDelete: BooleanReturningMethod;
  isRelate: BooleanReturningMethod;
  isUnrelate: BooleanReturningMethod;
  isInternal: BooleanReturningMethod;
  isJoinChildQuery: BooleanReturningMethod;
  hasWheres: BooleanReturningMethod;
  hasSelects: BooleanReturningMethod;
  hasWithGraph: BooleanReturningMethod;

  has: HasMethod;
  clear: ClearMethod<this>;

  clearSelect: ClearSelectMethod<this>;
  clearOrder: IdentityMethod<this>;
  clearWhere: IdentityMethod<this>;
  clearWithGraph: IdentityMethod<this>;
  clearAllowGraph: IdentityMethod<this>;

  ModelType: M;
  ResultType: R;
  ExtraType: X;

  // The model, result and extra types that `RebindType` is instantiated
  // with. They are `any` where `this` isn't rebound, e.g. when TypeScript
  // checks the members of a custom query builder against this class.
  '~rebind': unknown;
  '~M': this['~rebind'] extends [any, any, any] ? this['~rebind'][0] : any;
  '~R': this['~rebind'] extends [any, any, any] ? this['~rebind'][1] : any;
  '~X': this['~rebind'] extends [any, any, any] ? this['~rebind'][2] : any;

  /**
   * This query builder, re-instantiated with other model, result and extra
   * types, e.g. by `first()` or `page()`. Custom query builders redeclare it
   * to keep their own type:
   *
   *   declare RebindType: MyQueryBuilder<this['~M'], this['~R'], this['~X']>;
   */
  RebindType: QueryBuilder<this['~M'], this['~R'], this['~X']>;

  // The query builder rebound to the result kinds of the helper types, e.g.
  // `SingleQueryBuilder`. As members, they also resolve where `this` is
  // generic, e.g. in the methods of custom query builders. Of the members
  // starting with `~`, only `~M`, `~R` and `~X` are API, for `RebindType`.
  '~single': Rebind<this, M, ResultItem<R, M>>;
  '~maybeSingle': Rebind<this, M, ResultItem<R, M> | undefined>;
  '~array': Rebind<this, M, ResultItem<R, M>[]>;
  '~number': WriteQueryBuilder<this, M, R>;
  '~page': Rebind<this, M, Page<ResultItem<R, M>>>;

  then<R1 = R, R2 = never>(
    onfulfilled?: ((value: R) => R1 | PromiseLike<R1>) | undefined | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | undefined | null,
  ): Promise<R1 | R2>;

  catch<FR = never>(
    onrejected?: ((reason: any) => FR | PromiseLike<FR>) | undefined | null,
  ): Promise<R | FR>;
}

export type X<T> = Promise<T>;

export interface FetchGraphOptions {
  transaction?: TransactionOrKnex;
  skipFetched?: boolean;
}

export interface TraverserFunction {
  (model: Model, parentModel: Model, relationName: string): void;
}

export type ArrayQueryBuilderThunk<M extends Model> = () => ArrayQueryBuilder<QueryBuilderType<M>>;
export type CancelQueryThunk = (result: any) => void;

export interface StaticHookArguments<M extends Model, R = undefined> {
  asFindQuery: ArrayQueryBuilderThunk<M>;
  cancelQuery: CancelQueryThunk;
  context: QueryContext;
  transaction: TransactionOrKnex;
  relation?: Relation;
  modelOptions?: ModelOptions;
  items: Model[];
  inputItems: M[];
  result: R;
}

export type Transaction = Knex.Transaction;
export type TransactionOrKnex = Transaction | Knex;

export interface RelationMappings {
  [relationName: string]: RelationMapping<any>;
}

export type RelationMappingsThunk = () => RelationMappings;

export type ModelClassFactory = () => AnyModelConstructor;
export type ModelClassSpecifier = ModelClassFactory | AnyModelConstructor | string;
export type RelationMappingHook<M extends Model> = (
  model: M,
  context: QueryContext,
) => Promise<void> | void;
export type RelationMappingBeforeInsertHook<M extends Model> = (
  model: M,
  context: QueryContext,
  owner?: Model,
) => Promise<void> | void;
export type StringOrReferenceBuilder = string | ReferenceBuilder;
export type RelationMappingColumnRef = StringOrReferenceBuilder | StringOrReferenceBuilder[];

export interface RelationMapping<M extends Model> {
  relation: RelationType;
  modelClass: ModelClassSpecifier;
  join: RelationJoin;
  modify?: Modifier<QueryBuilderType<M>>;
  filter?: Modifier<QueryBuilderType<M>>;
  beforeInsert?: RelationMappingBeforeInsertHook<M>;
}

export interface RelationJoin {
  from: RelationMappingColumnRef;
  to: RelationMappingColumnRef;
  through?: RelationThrough<any>;
}

export interface RelationThrough<M extends Model> {
  from: RelationMappingColumnRef;
  to: RelationMappingColumnRef;
  extra?: string | string[] | Record<string, string>;
  modelClass?: ModelClassSpecifier;
  modify?: Modifier<QueryBuilderType<M>>;
  filter?: Modifier<QueryBuilderType<M>>;
  beforeInsert?: RelationMappingHook<M>;
}

export interface RelationType extends Constructor<Relation> {}

// The relation types are branded so that `TypedRelationMappings` can tell
// them apart. The brand is optional, so any `RelationType` is assignable.
export interface BelongsToOneRelationType extends RelationType {
  readonly [relationKind]?: 'BelongsToOne';
}
export interface HasOneRelationType extends RelationType {
  readonly [relationKind]?: 'HasOne';
}
export interface HasManyRelationType extends RelationType {
  readonly [relationKind]?: 'HasMany';
}
export interface ManyToManyRelationType extends RelationType {
  readonly [relationKind]?: 'ManyToMany';
}
export interface HasOneThroughRelationType extends RelationType {
  readonly [relationKind]?: 'HasOneThrough';
}
export interface BelongsToManyRelationType extends RelationType {
  readonly [relationKind]?: 'BelongsToMany';
}

/**
 * Names of the properties of M that hold related models. Properties typed
 * `any` or `any[]` are columns.
 */
export type RelationPropertyNames<M> = {
  [K in keyof M]-?: HoldsModels<NonNullable<M[K]>> extends true ? K : never;
}[keyof M];

type HoldsModels<P> = [P] extends [readonly (infer I)[]] ? IsModelLike<I> : IsModelLike<P>;

type IsModelLike<P> = 0 extends 1 & P ? false : [P] extends [ModelLike] ? true : false;

// Model instances, recognized by a method, as structural checks against
// `Model` circle back through the query builder types of the related models.
// Spreads of instances and their JSON don't have it.
type ModelLike = { $clone(opt?: CloneOptions): unknown };

export type TypedModelClassSpecifier<M extends Model> =
  string | ModelConstructor<M> | (() => ModelConstructor<M>);

/**
 * A `RelationMapping` for related models of type M with relation type R.
 */
export interface TypedRelationMapping<
  M extends Model,
  R extends RelationType = RelationType,
> extends RelationMapping<M> {
  relation: R;
  modelClass: TypedModelClassSpecifier<M>;
}

export type TypedRelationMappingFor<T> =
  NonNullable<T> extends (infer I extends Model)[]
    ? TypedRelationMapping<
        I,
        HasManyRelationType | ManyToManyRelationType | BelongsToManyRelationType
      >
    : NonNullable<T> extends infer I extends Model
      ? TypedRelationMapping<
          I,
          BelongsToOneRelationType | HasOneRelationType | HasOneThroughRelationType
        >
      : never;

/**
 * Relation mappings checked against the relation properties of model M.
 * Use it with `satisfies`, so the inferred type of the mappings is kept:
 *
 *   static relationMappings = {
 *     pets: { ... },
 *   } satisfies TypedRelationMappings<Person>;
 */
export type TypedRelationMappings<M extends Model> = [RelationPropertyNames<M>] extends [never]
  ? Record<string, never>
  : { [K in RelationPropertyNames<M>]?: TypedRelationMappingFor<M[K]> };

export interface Relation {
  name: string;
  ownerModelClass: typeof Model;
  relatedModelClass: typeof Model;
  ownerProp: RelationProperty;
  relatedProp: RelationProperty;
  joinModelClass: typeof Model;
  joinTable: string;
  joinTableOwnerProp: RelationProperty;
  joinTableRelatedProp: RelationProperty;
  isOneToOne(): boolean;
  keySide: 'owner' | 'related' | 'join';
}

export interface RelationProperty {
  size: number;
  modelClass: typeof Model;
  props: string[];
  cols: string[];
}

export interface Relations {
  [name: string]: Relation;
}

export interface QueryContext {
  transaction: Transaction;
  [key: string]: any;
}

export interface ModelOptions {
  patch?: boolean;
  skipValidation?: boolean;
  old?: object;
}

export interface CloneOptions {
  shallow?: boolean;
}

export interface ToJsonOptions extends CloneOptions {
  virtuals?: boolean | string[];
  format?: Pojo;
}

export interface ValidatorContext {
  [key: string]: any;
}

export interface ValidatorArgs {
  ctx: ValidatorContext;
  model: Model;
  json: Pojo;
  options: ModelOptions;
}

export class Validator {
  beforeValidate(args: ValidatorArgs): void;
  validate(args: ValidatorArgs): Pojo;
  afterValidate(args: ValidatorArgs): void;
}

export interface AjvConfig {
  onCreateAjv(ajv: Ajv): void;
  options?: AjvOptions;
}

export class AjvValidator extends Validator {
  constructor(config: AjvConfig);
}

/**
 * The options shared by `snakeCaseMappers` and `knexSnakeCaseMappers`.
 */
export interface SnakeCaseOptions {
  upperCase?: boolean;
  underscoreBeforeDigits?: boolean;
  underscoreBetweenUppercaseLetters?: boolean;
  noDoubleUnderscores?: boolean;
}

export interface SnakeCaseMappersOptions extends SnakeCaseOptions {
  /**
   * Only convert the column part of field expressions like
   * `jsonColumn:someKey` and keep their JSON keys as written. Defaults to
   * `true`. Set to `false` to convert the JSON keys too.
   */
  preserveJsonKeys?: boolean;
}

export interface KnexSnakeCaseMappersOptions extends SnakeCaseOptions {}

export type JsonColumnFormat = 'auto' | 'text' | 'parsed';

// Passed by queries to `fromDatabaseJson()`, `$setDatabaseJson()` and
// `$parseDatabaseJson()`. Overrides pass them on to `super`.
export interface DatabaseJsonOptions {
  knex?: Knex;
}

export interface ColumnNameMappers {
  parse(json: Pojo): Pojo;
  format(json: Pojo, isFieldExpression?: (key: string) => boolean): Pojo;
}

export interface SnakeCaseMappersFactory {
  (options?: SnakeCaseMappersOptions): ColumnNameMappers;
}

export interface KnexMappers {
  wrapIdentifier(identifier: string, origWrap: Identity<string>): string;
  postProcessResponse(response: any): any;
}

export interface KnexSnakeCaseMappersFactory {
  (options?: KnexSnakeCaseMappersOptions): KnexMappers;
}

export interface KnexIdentifierMappingFactory {
  (colToProp: Record<string, string>): KnexMappers;
}

export type ValidationErrorType =
  'ModelValidation' | 'RelationExpression' | 'UnallowedRelation' | 'InvalidGraph';

export class ValidationError extends Error {
  constructor(args: CreateValidationErrorArgs & { modelClass?: ModelClass<Model> });

  statusCode: number;
  message: string;
  data?: ErrorHash | any;
  type: ValidationErrorType | string;
  modelClass: ModelClass<Model>;
}

export interface ValidationErrorItem {
  message: string;
  keyword: string;
  params: Pojo;
}

export interface ErrorHash {
  [columnName: string]: ValidationErrorItem[];
}

export interface CreateValidationErrorArgs {
  statusCode?: number;
  message?: string;
  data?: ErrorHash | any;
  // This can be any string for custom errors. ValidationErrorType is there
  // only to document the default values objection uses internally.
  type: ValidationErrorType | string;
}

export class NotFoundError extends Error {
  constructor(args: CreateNotFoundErrorArgs & { modelClass?: ModelClass<Model> });

  statusCode: number;
  data?: any;
  type: 'NotFound';
  modelClass: ModelClass<Model>;
}

export interface CreateNotFoundErrorArgs {
  statusCode?: number;
  message?: string;
  data?: any;
  [key: string]: any;
}

export interface TableMetadata {
  columns: Array<string>;
}

export interface TableMetadataOptions {
  table: string;
}

export interface FetchTableMetadataOptions {
  knex?: Knex;
  force?: boolean;
  table?: string;
}

export interface Constructor<T> {
  new (): T;
}

export interface PrototypeType<T> extends Function {
  prototype: T;
}

export interface ConstructorFunctionType<T = any> extends PrototypeType<T> {
  new (...args: any[]): T;
}

// for internal use on generic static this deduction, copied from https://github.com/microsoft/TypeScript/issues/5863#issuecomment-1483978415
export type ConstructorType<T = unknown, Static extends Record<string, any> = PrototypeType<T>> = (
  ConstructorFunctionType<T> | PrototypeType<T>
) & {
  [Key in keyof Static]: Static[Key];
};

export interface ModelConstructor<M extends Model> extends Constructor<M> {}

export interface ModelClass<M extends Model> extends ModelConstructor<M> {
  QueryBuilder: typeof QueryBuilder;

  tableName: string;
  idColumn: null | string | string[] | readonly string[];
  jsonSchema: ReadonlyJSONSchema;
  relationMappings: RelationMappings | RelationMappingsThunk;
  modelPaths: string[];
  jsonAttributes: string[] | readonly string[];
  virtualAttributes: readonly string[];
  uidProp: string;
  uidRefProp: string;
  dbRefProp: string;
  propRefRegex: RegExp;
  graphUnrelateProp: string;
  graphDeleteProp: string;
  pickJsonSchemaProperties: boolean;
  relatedFindQueryMutates: boolean;
  relatedInsertQueryMutates: boolean;
  useLimitInFirst: boolean;
  jsonColumnFormat: JsonColumnFormat;
  modifiers: Modifiers;
  columnNameMappers: ColumnNameMappers;

  raw: RawFunction;
  ref: ReferenceFunction;
  fn: FunctionFunction;

  BelongsToOneRelation: BelongsToOneRelationType;
  HasOneRelation: HasOneRelationType;
  HasManyRelation: HasManyRelationType;
  ManyToManyRelation: ManyToManyRelationType;
  HasOneThroughRelation: HasOneThroughRelationType;
  BelongsToManyRelation: BelongsToManyRelationType;

  defaultGraphOptions?: GraphOptions;

  query(this: Constructor<M>, trxOrKnex?: TransactionOrKnex): QueryBuilderType<M>;

  relatedQuery<K extends keyof M>(
    relationName: K,
    trxOrKnex?: TransactionOrKnex,
  ): ArrayRelatedQueryBuilder<M[K]>;

  relatedQuery<RM extends Model>(
    relationName: string,
    trxOrKnex?: TransactionOrKnex,
  ): QueryBuilderType<RM>;

  fromJson(json: object, opt?: ModelOptions): M;
  fromDatabaseJson(json: object, options?: DatabaseJsonOptions): M;

  columnNameToPropertyName(columnName: string): string;
  propertyNameToColumnName(propertyName: string): string;

  createValidator(): Validator;
  createValidationError(args: CreateValidationErrorArgs): Error;
  createNotFoundError(queryContext: QueryContext, args: CreateNotFoundErrorArgs): Error;

  tableMetadata(opt?: TableMetadataOptions): TableMetadata;
  fetchTableMetadata(opt?: FetchTableMetadataOptions): Promise<TableMetadata>;

  knex(knex?: Knex): Knex;
  knexQuery(): Knex.QueryBuilder;
  startTransaction(knexOrTransaction?: TransactionOrKnex): Promise<Transaction>;

  transaction<T>(callback: (trx: Transaction) => Promise<T>): Promise<T>;
  transaction<T>(
    trxOrKnex: TransactionOrKnex,
    callback: (trx: Transaction) => Promise<T>,
  ): Promise<T>;

  bindKnex(trxOrKnex: TransactionOrKnex): this;
  bindTransaction(trxOrKnex: TransactionOrKnex): this;

  fetchGraph<const E extends RelationExpression<M>>(
    modelOrObject: PartialModelObject<M>,
    expression: E,
    options?: FetchGraphOptions,
  ): Rebind<QueryBuilderType<M>, WithGraphModel<M, E>, WithGraphModel<M, E>>;

  fetchGraph<const E extends RelationExpression<M>>(
    modelOrObject: PartialModelObject<M>[],
    expression: E,
    options?: FetchGraphOptions,
  ): Rebind<QueryBuilderType<M>, WithGraphModel<M, E>, WithGraphModel<M, E>[]>;

  getRelations(): Relations;
  getRelation(name: string): Relation;

  traverse(models: Model | Model[], traverser: TraverserFunction): void;
  traverse(
    filterConstructor: ModelConstructor<Model>,
    models: Model | Model[],
    traverser: TraverserFunction,
  ): void;
  traverseAsync(models: Model | Model[], traverser: TraverserFunction): Promise<void>;
  traverseAsync(
    filterConstructor: ModelConstructor<Model>,
    models: Model | Model[],
    traverser: TraverserFunction,
  ): Promise<void>;

  beforeFind(args: StaticHookArguments<any>): any;
  afterFind(args: StaticHookArguments<any, Model | Model[] | undefined>): any;
  beforeInsert(args: StaticHookArguments<any>): any;
  afterInsert(args: StaticHookArguments<any, Model | Model[]>): any;
  beforeUpdate(args: StaticHookArguments<any>): any;
  afterUpdate(args: StaticHookArguments<any, number | Model | Model[] | undefined>): any;
  beforeDelete(args: StaticHookArguments<any>): any;
  afterDelete(args: StaticHookArguments<any, number | Model | Model[] | undefined>): any;
}

export class Model {
  static QueryBuilder: typeof QueryBuilder;

  static tableName: string;
  static idColumn: null | string | string[] | readonly string[];
  static jsonSchema: ReadonlyJSONSchema;
  static relationMappings: RelationMappings | RelationMappingsThunk;
  static modelPaths: string[];
  static jsonAttributes: string[] | readonly string[];
  static virtualAttributes: readonly string[];
  static uidProp: string;
  static uidRefProp: string;
  static dbRefProp: string;
  static propRefRegex: RegExp;
  static graphUnrelateProp: string;
  static graphDeleteProp: string;
  static pickJsonSchemaProperties: boolean;
  static relatedFindQueryMutates: boolean;
  static relatedInsertQueryMutates: boolean;
  static useLimitInFirst: boolean;
  static jsonColumnFormat: JsonColumnFormat;
  static modifiers: Modifiers;
  static columnNameMappers: ColumnNameMappers;

  static raw: RawFunction;
  static ref: ReferenceFunction;
  static fn: FunctionFunction;

  static BelongsToOneRelation: BelongsToOneRelationType;
  static HasOneRelation: HasOneRelationType;
  static HasManyRelation: HasManyRelationType;
  static ManyToManyRelation: ManyToManyRelationType;
  static HasOneThroughRelation: HasOneThroughRelationType;
  static BelongsToManyRelation: BelongsToManyRelationType;

  static defaultGraphOptions?: GraphOptions;

  static query<M extends Model, C = unknown>(
    this: ConstructorType<M> & IfStrict<unknown, C>,
    trxOrKnex?: TransactionOrKnex,
  ): IfStrict<QueryBuilderType<M>, WithExtra<QueryBuilderType<M>, QueryExtra<C, {}>>>;

  static relatedQuery<M extends Model, K extends keyof M, C = unknown>(
    this: ConstructorType<M> & IfStrict<unknown, C>,
    relationName: K,
    trxOrKnex?: TransactionOrKnex,
  ): IfStrict<
    ArrayRelatedQueryBuilder<M[K]>,
    WithExtra<ArrayRelatedQueryBuilder<M[K]>, QueryExtra<MappedClass<ClassMappings<C>, K>, {}>>
  >;

  static relatedQuery<RM extends Model>(
    relationName: string,
    trxOrKnex?: TransactionOrKnex,
  ): QueryBuilderType<RM>;

  static fromJson<M extends Model>(this: ConstructorType<M>, json: object, opt?: ModelOptions): M;
  static fromDatabaseJson<M extends Model>(
    this: ConstructorType<M>,
    json: object,
    options?: DatabaseJsonOptions,
  ): M;

  static columnNameToPropertyName(columnName: string): string;
  static propertyNameToColumnName(propertyName: string): string;

  static createValidator(): Validator;
  static createValidationError(args: CreateValidationErrorArgs): Error;
  static createNotFoundError(queryContext: QueryContext, args: CreateNotFoundErrorArgs): Error;

  static tableMetadata(opt?: TableMetadataOptions): TableMetadata;
  static fetchTableMetadata(opt?: FetchTableMetadataOptions): Promise<TableMetadata>;

  static knex(knex?: Knex): Knex;
  static knexQuery(): Knex.QueryBuilder;
  static startTransaction(knexOrTransaction?: TransactionOrKnex): Promise<Transaction>;

  static transaction<T>(callback: (trx: Transaction) => Promise<T>): Promise<T>;
  static transaction<T>(
    trxOrKnex: TransactionOrKnex | undefined,
    callback: (trx: Transaction) => Promise<T>,
  ): Promise<T>;

  static bindKnex<M>(this: M, trxOrKnex: TransactionOrKnex): M;
  static bindTransaction<M>(this: M, trxOrKnex: TransactionOrKnex): M;

  // E defaults to `string` so that `fetchGraph<Person>(...)` still compiles,
  // without narrowing, as TypeScript doesn't infer the remaining arguments.
  static fetchGraph<M extends Model, const E extends RelationExpression<M> = string>(
    this: ConstructorType<M>,
    modelOrObject: PartialModelObject<M>,
    expression: E,
    options?: FetchGraphOptions,
  ): Rebind<QueryBuilderType<M>, WithGraphModel<M, E>, WithGraphModel<M, E>>;

  static fetchGraph<M extends Model, const E extends RelationExpression<M> = string>(
    this: ConstructorType<M>,
    modelOrObject: PartialModelObject<M>[],
    expression: E,
    options?: FetchGraphOptions,
  ): Rebind<QueryBuilderType<M>, WithGraphModel<M, E>, WithGraphModel<M, E>[]>;

  static getRelations(): Relations;
  static getRelation(name: string): Relation;

  static traverse(models: Model | Model[], traverser: TraverserFunction): void;
  static traverse(
    filterConstructor: typeof Model,
    models: Model | Model[],
    traverser: TraverserFunction,
  ): void;
  static traverseAsync(models: Model | Model[], traverser: TraverserFunction): Promise<void>;
  static traverseAsync(
    filterConstructor: typeof Model,
    models: Model | Model[],
    traverser: TraverserFunction,
  ): Promise<void>;

  static beforeFind(args: StaticHookArguments<any>): any;
  static afterFind(args: StaticHookArguments<any, Model | Model[] | undefined>): any;
  static beforeInsert(args: StaticHookArguments<any>): any;
  static afterInsert(args: StaticHookArguments<any, Model | Model[]>): any;
  static beforeUpdate(args: StaticHookArguments<any>): any;
  static afterUpdate(args: StaticHookArguments<any, number | Model | Model[] | undefined>): any;
  static beforeDelete(args: StaticHookArguments<any>): any;
  static afterDelete(args: StaticHookArguments<any, number | Model | Model[] | undefined>): any;

  $modelClass: ModelClass<this>;

  $relatedQuery<K extends keyof this>(
    relationName: K,
    trxOrKnex?: TransactionOrKnex,
  ): RelatedQueryBuilder<this[K]>;

  $relatedQuery<RM extends Model>(
    relationName: string,
    trxOrKnex?: TransactionOrKnex,
  ): QueryBuilderType<RM>;

  $query(trxOrKnex?: TransactionOrKnex): SingleQueryBuilder<QueryBuilderType<this>>;

  $id(id: any): void;
  $id(): any;

  $fetchGraph<const E extends RelationExpression<this>>(
    expression: E,
    options?: FetchGraphOptions,
  ): Rebind<QueryBuilderType<this>, WithGraphModel<this, E>, WithGraphModel<this, E>>;

  $formatDatabaseJson(json: Pojo): Pojo;
  $parseDatabaseJson(json: Pojo, options?: DatabaseJsonOptions): Pojo;

  $formatJson(json: Pojo, opt?: Pojo): Pojo;
  $parseJson(json: Pojo, opt?: ModelOptions): Pojo;

  $beforeValidate(jsonSchema: JSONSchema, json: Pojo, opt: ModelOptions): JSONSchema;
  $validate(json?: Pojo, opt?: ModelOptions): Pojo; // may throw ValidationError if validation fails
  $afterValidate(json: Pojo, opt: ModelOptions): void; // may throw ValidationError if validation fails

  $beforeInsert(queryContext: QueryContext): Promise<any> | void;
  $afterInsert(queryContext: QueryContext): Promise<any> | void;
  $afterUpdate(opt: ModelOptions, queryContext: QueryContext): Promise<any> | void;
  $beforeUpdate(opt: ModelOptions, queryContext: QueryContext): Promise<any> | void;
  $afterFind(queryContext: QueryContext): Promise<any> | void;
  $beforeDelete(queryContext: QueryContext): Promise<any> | void;
  $afterDelete(queryContext: QueryContext): Promise<any> | void;

  $toDatabaseJson(): Pojo;
  $toJson(opt?: ToJsonOptions): ModelJson<this>;
  toJSON(opt?: ToJsonOptions): ModelJson<this>;

  $setJson(json: object, opt?: ModelOptions): this;
  $setDatabaseJson(json: object, options?: DatabaseJsonOptions): this;

  $setRelated<RM extends Model>(
    relation: String | Relation,
    related: RM | RM[] | null | undefined,
  ): this;

  $appendRelated<RM extends Model>(
    relation: String | Relation,
    related: RM | RM[] | null | undefined,
  ): this;

  $set(obj: Pojo): this;
  $clone(opt?: CloneOptions): this;
  $traverse(filterConstructor: typeof Model, traverser: TraverserFunction): this;
  $traverse(traverser: TraverserFunction): this;
  $traverseAsync(filterConstructor: typeof Model, traverser: TraverserFunction): Promise<this>;
  $traverseAsync(traverser: TraverserFunction): Promise<this>;
  $omitFromJson(keys: string | string[] | { [key: string]: boolean }): this;
  $omitFromDatabaseJson(keys: string | string[] | { [key: string]: boolean }): this;

  $knex(): Knex;
  $transaction(): Knex;

  QueryBuilderType: QueryBuilder<this, this[]>;

  /**
   * How `static columnNameMappers` maps the column names in queries, for the
   * column checks of strict mode: 'snakeCase' for `snakeCaseMappers()`,
   * 'upperSnakeCase' with its `upperCase` option, and 'open' for other mappers,
   * which turns the checks off.
   */
  ColumnNameMapping?: 'snakeCase' | 'upperSnakeCase' | 'open';
}

/**
 * Overloading is required here until the following issues (at least) are resolved:
 *
 * - https://github.com/microsoft/TypeScript/issues/1360
 * - https://github.com/Microsoft/TypeScript/issues/5453
 *
 * @tutorial https://ditojs.github.io/objection/guide/transactions.html#creating-a-transaction
 */
export interface transaction {
  start(knexOrModel: Knex | AnyModelConstructor): Promise<Transaction>;

  <MC1 extends AnyModelConstructor, ReturnValue>(
    modelClass1: MC1,
    callback: (boundModelClass: MC1, trx?: Transaction) => Promise<ReturnValue>,
  ): Promise<ReturnValue>;

  <MC1 extends AnyModelConstructor, MC2 extends AnyModelConstructor, ReturnValue>(
    modelClass1: MC1,
    modelClass2: MC2,
    callback: (
      boundModelClass1: MC1,
      boundModelClass2: MC2,
      trx?: Transaction,
    ) => Promise<ReturnValue>,
  ): Promise<ReturnValue>;

  <
    MC1 extends AnyModelConstructor,
    MC2 extends AnyModelConstructor,
    MC3 extends AnyModelConstructor,
    ReturnValue,
  >(
    modelClass1: MC1,
    modelClass2: MC2,
    modelClass3: MC3,
    callback: (
      boundModelClass1: MC1,
      boundModelClass2: MC2,
      boundModelClass3: MC3,
      trx?: Transaction,
    ) => Promise<ReturnValue>,
  ): Promise<ReturnValue>;

  <
    MC1 extends AnyModelConstructor,
    MC2 extends AnyModelConstructor,
    MC3 extends AnyModelConstructor,
    MC4 extends AnyModelConstructor,
    ReturnValue,
  >(
    modelClass1: MC1,
    modelClass2: MC2,
    modelClass3: MC3,
    modelClass4: MC4,
    callback: (
      boundModelClass1: MC1,
      boundModelClass2: MC2,
      boundModelClass3: MC3,
      boundModelClass4: MC4,
      trx?: Transaction,
    ) => Promise<ReturnValue>,
  ): Promise<ReturnValue>;

  <
    MC1 extends AnyModelConstructor,
    MC2 extends AnyModelConstructor,
    MC3 extends AnyModelConstructor,
    MC4 extends AnyModelConstructor,
    MC5 extends AnyModelConstructor,
    ReturnValue,
  >(
    modelClass1: MC1,
    modelClass2: MC2,
    modelClass3: MC3,
    modelClass4: MC4,
    modelClass5: MC5,
    callback: (
      boundModelClass1: MC1,
      boundModelClass2: MC2,
      boundModelClass3: MC3,
      boundModelClass4: MC4,
      boundModelClass5: MC5,
      trx?: Transaction,
    ) => Promise<ReturnValue>,
  ): Promise<ReturnValue>;

  <ReturnValue>(
    knex: Knex,
    callback: (trx: Transaction) => Promise<ReturnValue>,
  ): Promise<ReturnValue>;
}

export interface initialize {
  (knex: Knex, modelClasses: AnyModelConstructor[]): Promise<void>;
  (modelClasses: AnyModelConstructor[]): Promise<void>;
}

/**
 * The type of the values that a JSON schema declared with `as const`
 * describes, e.g. of JSON columns, or of models that subclasses extend, whose
 * `jsonSchema` has the general type for `FromModel`:
 *
 *   const entrySchema = { type: 'object', properties: { ... } } as const;
 *
 *   class Entry extends Model {
 *     static jsonSchema: ReadonlyJSONSchema = entrySchema;
 *   }
 *
 *   interface Entry extends FromJSONSchema<typeof entrySchema>, FromModel<typeof Entry> {}
 *
 * Supports `type` (also as an array), `required`, `nullable`, `enum`,
 * `const`, `items` (also as a tuple), nested `properties`, `anyOf` and
 * `oneOf`. Formats like 'date-time' stay strings, as in JSON. Properties
 * that aren't required are optional. Next to `type` or `properties`, `anyOf`
 * and `oneOf` only add constraints, e.g. alternative `required` lists, and
 * don't change the type.
 */
export type FromJSONSchema<S> = S extends boolean
  ? unknown
  : S extends { const: infer C }
    ? Extract<C, SchemaType<S>>
    : S extends { enum: readonly (infer E)[] }
      ? Extract<E, SchemaType<S>>
      : S extends { type: unknown }
        ? SchemaType<S>
        : S extends { properties: object }
          ? SchemaObject<S>
          : S extends { anyOf: readonly (infer A)[] } | { oneOf: readonly (infer A)[] }
            ? FromJSONSchema<A> | SchemaNullable<S>
            : unknown;

// The type that `type` allows, which `enum` and `const` values are narrowed
// by, as validation checks both.
type SchemaType<S> = S extends { type: infer T }
  ? | (T extends readonly (infer N)[] ? SchemaTypeName<N, S> : SchemaTypeName<T, S>)
    | SchemaNullable<S>
  : unknown;

type SchemaNullable<S> = S extends { nullable: true } ? null : never;

type SchemaTypeName<N, S> = N extends 'string'
  ? string
  : N extends 'number' | 'integer'
    ? number
    : N extends 'boolean'
      ? boolean
      : N extends 'null'
        ? null
        : N extends 'array'
          ? SchemaArray<S>
          : N extends 'object'
            ? SchemaObject<S>
            : unknown;

type SchemaArray<S> = S extends { items: infer I }
  ? I extends readonly unknown[]
    ? SchemaTuple<I, S>
    : FromJSONSchema<I>[]
  : unknown[];

// Tuple `items` only check the items that are present: they are required
// with a `minItems` of the tuple's length, and more items are allowed unless
// `additionalItems` restricts them.
type SchemaTuple<I extends readonly unknown[], S> = [
  ...(S extends { minItems: I['length'] }
    ? { -readonly [K in keyof I]: FromJSONSchema<I[K]> }
    : { -readonly [K in keyof I]?: FromJSONSchema<I[K]> }),
  ...(S extends { additionalItems: false }
    ? []
    : S extends { additionalItems: infer A }
      ? FromJSONSchema<A>[]
      : unknown[]),
];

type SchemaObject<S> = S extends { properties: infer P }
  ? [keyof P] extends [never]
    ? { [key: string]: unknown }
    : SchemaProperties<P, S extends { required: readonly (infer R)[] } ? R : never>
  : { [key: string]: unknown };

// The intersection is flattened into one object type for readable hovers.
type SchemaProperties<P, R> = {
  -readonly [K in keyof P as K extends R ? K : never]: FromJSONSchema<P[K]>;
} & {
  -readonly [K in keyof P as K extends R ? never : K]?: FromJSONSchema<P[K]>;
} extends infer O
  ? { [K in keyof O]: O[K] }
  : never;

/**
 * The properties of a model class, derived from its `jsonSchema` declared
 * `as const` and its `relationMappings`:
 *
 *   class Person extends Model {
 *     static jsonSchema = { ... } as const;
 *
 *     static relationMappings = () => ({
 *       parent: {
 *         relation: Model.BelongsToOneRelation,
 *         modelClass: Person,
 *         join: { from: 'persons.parentId', to: 'persons.id' },
 *       },
 *     });
 *   }
 *
 *   interface Person extends FromModel<typeof Person> {}
 *
 * The properties are typed as with `FromJSONSchema`. Relations are optional, as
 * they are only present when fetched: to-one relations are typed `M | null`,
 * as `withGraphFetched()` sets missing ones to `null`, and to-many relations
 * `M[]`. Relations with a module path as `modelClass`, and mappings declared
 * as `RelationMapping` instead of inferred, are left out, as are a schema and
 * mappings with their general types, e.g. inherited from `Model`. The names of
 * `virtualAttributes` declared `as const` are kept for `ModelJson`.
 */
export type FromModel<C extends { jsonSchema: unknown; relationMappings: unknown }> =
  ModelSchemaProperties<C['jsonSchema']> &
    ModelRelationProperties<C['relationMappings']> &
    VirtualAttributeKeys<C>;

// One key per name, so that subclasses that add virtual attributes have the
// same keys as their parent for the inherited ones.
type VirtualAttributeKeys<C> = C extends { virtualAttributes: infer V extends readonly string[] }
  ? string extends V[number]
    ? {}
    : { readonly [K in V[number] as `~virtual:${K}`]?: true }
  : {};

type ModelSchemaProperties<S> = ReadonlyJSONSchema extends S
  ? {}
  : FromJSONSchema<S> extends infer P extends object
    ? P
    : {};

// Relations are picked by their mappings, as resolving the related models
// while the model's own type is built would make it its own base type.
type ModelRelationProperties<T, R = T extends () => infer M ? M : T> = string extends keyof R
  ? {}
  : {
      -readonly [K in keyof R as IsMappedRelation<R[K]> extends true ? K : never]?: MappedRelation<
        R[K]
      >;
    };

// Relation types without a brand and module paths can't be resolved.
type IsMappedRelation<M> = M extends { relation: infer T; modelClass: infer C }
  ? [MappedKind<T>] extends [never]
    ? false
    : C extends string
      ? false
      : true
  : false;

// The related model is inferred from the constructor without checking it
// against `Model`, as that check would circle back through the relations of
// self-referencing models.
type MappedRelation<M> = M extends { relation: infer T; modelClass: infer C }
  ? MappedKind<T> extends 'HasMany' | 'ManyToMany' | 'BelongsToMany'
    ? MappedModel<C>[]
    : MappedModel<C> | null
  : never;

type MappedKind<T> = T extends { readonly [relationKind]?: infer K } ? K : never;

type MappedModel<C> = C extends abstract new (...args: any) => infer I
  ? I
  : C extends () => abstract new (...args: any) => infer I
    ? I
    : never;

/**
 * A JSON schema with readonly arrays, the type of `static jsonSchema`, so that
 * it takes schemas declared `as const`, for `FromJSONSchema`. A `JSONSchema` is
 * assignable to it.
 */
export type ReadonlyJSONSchema = ReadonlyDeep<JSONSchema>;

type ReadonlyDeep<T> = T extends (infer I)[]
  ? readonly ReadonlyDeep<I>[]
  : T extends object
    ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
    : T;

/**
 * JSON Schema 7
 * Draft 07
 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01
 *
 * These definitions were written by
 *
 * Boris Cherny https://github.com/bcherny,
 * Cyrille Tuzi https://github.com/cyrilletuzi,
 * Lucian Buzzo https://github.com/lucianbuzzo,
 * Roland Groza https://github.com/rolandjitsu.
 *
 * https://www.npmjs.com/package/@types/json-schema
 */

/**
 * Primitive type
 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.1.1
 */
export type JSONSchemaTypeName =
  'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | string;

export type JSONSchemaType = JSONSchemaArray[] | boolean | number | null | object | string;

// Workaround for infinite type recursion
// https://github.com/Microsoft/TypeScript/issues/3496#issuecomment-128553540
export interface JSONSchemaArray extends Array<JSONSchemaType> {}

/**
 * Meta schema
 *
 * Recommended values:
 * - 'http://json-schema.org/schema#'
 * - 'http://json-schema.org/hyper-schema#'
 * - 'http://json-schema.org/draft-07/schema#'
 * - 'http://json-schema.org/draft-07/hyper-schema#'
 *
 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-5
 */
export type JSONSchemaVersion = string;

/**
 * JSON Schema v7
 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01
 */
export type JSONSchemaDefinition = JSONSchema | boolean;
export interface JSONSchema {
  $id?: string;
  $ref?: string;
  $schema?: JSONSchemaVersion;
  $comment?: string;

  /**
   * @see https://json-schema.org/draft/2019-09/release-notes
   */
  $defs?: {
    [key: string]: JSONSchemaDefinition;
  };

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.1
   */
  type?: JSONSchemaTypeName | JSONSchemaTypeName[];
  enum?: JSONSchemaType[];
  const?: JSONSchemaType;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.2
   */
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.3
   */
  maxLength?: number;
  minLength?: number;
  pattern?: string;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.4
   */
  items?: JSONSchemaDefinition | JSONSchemaDefinition[];
  additionalItems?: JSONSchemaDefinition;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchema;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.5
   */
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  properties?: {
    [key: string]: JSONSchemaDefinition;
  };
  patternProperties?: {
    [key: string]: JSONSchemaDefinition;
  };
  additionalProperties?: JSONSchemaDefinition;
  dependencies?: {
    [key: string]: JSONSchemaDefinition | string[];
  };
  propertyNames?: JSONSchemaDefinition;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.6
   */
  if?: JSONSchemaDefinition;
  then?: JSONSchemaDefinition;
  else?: JSONSchemaDefinition;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.7
   */
  allOf?: JSONSchemaDefinition[];
  anyOf?: JSONSchemaDefinition[];
  oneOf?: JSONSchemaDefinition[];
  not?: JSONSchemaDefinition;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-7
   */
  format?: string;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-8
   */
  contentMediaType?: string;
  contentEncoding?: string;

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-9
   */
  definitions?: {
    [key: string]: JSONSchemaDefinition;
  };

  /**
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-10
   */
  title?: string;
  description?: string;
  default?: JSONSchemaType;
  readOnly?: boolean;
  writeOnly?: boolean;
  examples?: JSONSchemaType;
}
