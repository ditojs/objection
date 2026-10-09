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

import Ajv, { Options as AjvOptions } from 'ajv';
import * as dbErrors from 'db-errors';
import { Knex } from 'knex';

// Export the entire Objection namespace.
export = Objection;

declare namespace Objection {
  const raw: RawFunction;
  const val: ValueFunction;
  const ref: ReferenceFunction;
  const fn: FunctionFunction;

  const compose: ComposeFunction;
  const mixin: MixinFunction;

  const snakeCaseMappers: SnakeCaseMappersFactory;
  const knexSnakeCaseMappers: KnexSnakeCaseMappersFactory;
  const knexIdentifierMapping: KnexIdentifierMappingFactory;

  const transaction: transaction;
  const initialize: initialize;

  // Import aliases re-export both the value and the type side of the classes,
  // so they can be used with `instanceof` as well as in type annotations.
  export import DBError = dbErrors.DBError;
  export import DataError = dbErrors.DataError;
  export import CheckViolationError = dbErrors.CheckViolationError;
  export import UniqueViolationError = dbErrors.UniqueViolationError;
  export import ConstraintViolationError = dbErrors.ConstraintViolationError;
  export import ForeignKeyViolationError = dbErrors.ForeignKeyViolationError;
  export import NotNullViolationError = dbErrors.NotNullViolationError;

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

  export interface Plugin {
    <M extends typeof Model>(modelClass: M): M;
  }

  export interface MixinFunction {
    <MC extends AnyModelConstructor>(modelClass: MC, ...plugins: Plugin[]): MC;
    <MC extends AnyModelConstructor>(modelClass: MC, plugins: Plugin[]): MC;
  }

  interface Aliasable {
    as(alias: string): this;
  }

  interface Castable extends Aliasable {
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

  type Raw = RawBuilder | Knex.Raw;
  type Operator = string;
  type ColumnRef = string | Raw | ReferenceBuilder;
  type TableRef<QB extends AnyQueryBuilder> = ColumnRef | AnyQueryBuilder | CallbackVoid<QB>;

  type PrimitiveValue =
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

  type Expression<T> = T | Raw | ReferenceBuilder | ValueBuilder | AnyQueryBuilder;

  type Id = string | number | BigInt | Buffer;
  type CompositeId = Id[];
  type MaybeCompositeId = Id | CompositeId;

  interface ExpressionObject {
    [key: string]: Expression<PrimitiveValue>;
  }

  interface PrimitiveValueObject {
    [key: string]: PrimitiveValue;
  }

  interface CallbackVoid<T> {
    (this: T, arg: T): void;
  }

  type Identity<T> = (value: T) => T;
  type AnyQueryBuilder = QueryBuilder<any, any>;
  type AnyModelConstructor = ModelConstructor<Model>;
  type ModifierFunction<QB extends AnyQueryBuilder> = (qb: QB, ...args: any[]) => void;
  type Modifier<QB extends AnyQueryBuilder = AnyQueryBuilder> =
    ModifierFunction<QB> | string | string[] | Record<string, Expression<PrimitiveValue>>;
  type OrderByDirection = 'asc' | 'desc' | 'ASC' | 'DESC';
  type OrderByNulls = 'first' | 'last';

  interface Modifiers<QB extends AnyQueryBuilder = AnyQueryBuilder> {
    [key: string]: Modifier<QB>;
  }

  type RelationExpression<M extends Model> = string | object;

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
   * recursion with `^`), so these simply don't narrow.
   */
  type ParseRelationExpression<E, Mode extends ParseMode = 'graph'> = string extends E
    ? {}
    : E extends string
      ? ParseRelationString<E, Mode>
      : ParseRelationObject<E, Mode>;

  /**
   * In 'graph' mode, the parser only keeps nodes that can be narrowed (see
   * RelationName). In 'join' mode, used for the column scope of joined
   * relations in strict mode, nodes are kept with their aliases, as
   * 'relation' or 'relation as alias', and interpreted by JoinNode.
   */
  type ParseMode = 'graph' | 'join';

  type Whitespace = ' ' | '\n' | '\r' | '\t';

  type Trim<S extends string> = S extends `${Whitespace}${infer R}`
    ? Trim<R>
    : S extends `${infer L}${Whitespace}`
      ? Trim<L>
      : S;

  /**
   * Counts the occurrences of character C in S, as a tuple length.
   */
  type CountChar<
    S extends string,
    C extends string,
    N extends 0[] = [],
  > = S extends `${string}${C}${infer R}` ? CountChar<R, C, [...N, 0]> : N['length'];

  /**
   * True if S has as many opening as closing brackets and parentheses.
   */
  type IsBalanced<S extends string> =
    CountChar<S, '['> extends CountChar<S, ']'>
      ? CountChar<S, '('> extends CountChar<S, ')'>
        ? true
        : false
      : false;

  /**
   * Splits a list of expressions at the commas that aren't nested inside
   * brackets or parentheses: 'a, b.[c, d]' -> ['a', 'b.[c, d]'].
   */
  type SplitList<
    S extends string,
    Acc extends string = '',
    Out extends string[] = [],
  > = S extends `${infer Head},${infer Rest}`
    ? IsBalanced<`${Acc}${Head}`> extends true
      ? SplitList<Rest, '', [...Out, `${Acc}${Head}`]>
      : SplitList<Rest, `${Acc}${Head},`, Out>
    : [...Out, `${Acc}${S}`];

  type ParseRelationList<L extends string[], Mode extends ParseMode, Acc = {}> = L extends [
    infer H extends string,
    ...infer T extends string[],
  ]
    ? ParseRelationList<T, Mode, Acc & ParseRelationString<H, Mode>>
    : Acc;

  /**
   * Parses '[a, b]', 'a.b' and 'a' style expressions.
   */
  type ParseRelationString<S extends string, Mode extends ParseMode = 'graph'> =
    Trim<S> extends `[${infer Inner}]`
      ? ParseRelationList<SplitList<Inner>, Mode>
      : Trim<S> extends `${infer Head}.${infer Rest}`
        ? IsBalanced<Head> extends true
          ? RelationNode<RelationName<Head, Mode>, ParseRelationString<Rest, Mode>>
          : {}
        : RelationNode<RelationName<S, Mode>, {}>;

  /**
   * Extracts the relation name from a single node, dropping modifiers:
   * 'pets(selectName)' -> 'pets'. Returns never for nodes that can't be
   * narrowed: aliases ('pets as p'), '*' and recursion ('^', '^2').
   */
  type RelationName<S extends string, Mode extends ParseMode = 'graph'> =
    Trim<S> extends `${infer Name}(${string})`
      ? RelationName<Name, Mode>
      : Trim<S> extends infer Name extends string
        ? Mode extends 'join'
          ? Name extends ''
            ? never
            : Name
          : Name extends '' | '*' | `^${string}` | `${string}${Whitespace}${string}`
            ? never
            : string extends Name
              ? never
              : Name
        : never;

  type RelationNode<Name extends string, Children> = [Name] extends [never]
    ? {}
    : { [K in Name]: Children };

  /**
   * Parses `{ a: true, b: { c: true } }` style expressions. Keys starting with
   * `$` are options, and aliased nodes (`{ p: { $relation: 'pets' } }`) are
   * skipped.
   */
  type ParseRelationObject<E, Mode extends ParseMode = 'graph'> = string extends keyof E
    ? {}
    : {
        [
          K in keyof E as K extends `$${string}`
            ? never
            : false extends E[K]
              ? never
              : E[K] extends { $relation: infer R }
                ? Mode extends 'join'
                  ? R extends string
                    ? `${R} as ${K & string}`
                    : never
                  : never
                : K
        ]: E[K] extends object ? ParseRelationObject<E[K], Mode> : {};
      };

  /**
   * Marks the relations in tree T as fetched on model M: they become required
   * and are narrowed recursively. Only `undefined` is removed: declared `null`
   * is kept, as to-one relations can be null when there is no related row.
   */
  type WithGraph<M, T> = [keyof T] extends [never]
    ? M
    : WithGraphRelations<M, T, FetchedRelations<M, T>>;

  type WithGraphRelations<M, T, K extends keyof M & keyof T> = [K] extends [never]
    ? M
    : { -readonly [P in K]-?: WithGraphProperty<Defined<M[P]>, T[P]> } & UnnarrowedMethods<M> & M;

  /**
   * `$query()` of the un-narrowed model M, as it doesn't fetch the relations
   * that were fetched on the instance. Otherwise its polymorphic `this` would
   * resolve to the narrowed model. With chained narrowing, the first `$query`
   * signature of the intersection wins, which is the one of the innermost,
   * un-narrowed model.
   */
  type UnnarrowedMethods<M> = Pick<M, Extract<'$query', keyof M>>;

  /**
   * The keys of tree T that are relation properties of model M.
   */
  type FetchedRelations<M, T> = {
    [K in keyof M & keyof T]: NonNullable<M[K]> extends Model | Model[] ? K : never;
  }[keyof M & keyof T];

  type WithGraphProperty<P, T> = [keyof T] extends [never]
    ? P
    : P extends Array<infer I>
      ? WithGraph<I, T>[]
      : P extends Model
        ? WithGraph<P, T>
        : P;

  /**
   * The model type after fetching the relation expression E on model M.
   */
  type WithGraphModel<M, E> = WithGraph<M, ParseRelationExpression<E>>;

  /**
   * The query builder type for model M after fetching relation expression E.
   * `M extends unknown` makes this distributive, so that in generic code (e.g.
   * `this` in model methods), TypeScript can resolve it through the constraint
   * of M.
   */
  type WithGraphModelQueryBuilder<M extends Model, E> = M extends unknown
    ? WithGraphModel<M, E>['QueryBuilderType']
    : never;

  /**
   * The query builder type after `withGraphFetched(E)` / `withGraphJoined(E)`
   * on QB. The model type is narrowed, and the query builder for the narrowed
   * model is looked up through its `QueryBuilderType`, so custom query
   * builders are kept. Falls back to QB if nothing can be narrowed, or if the
   * model type is `any` (`0 extends 1 & M`), e.g. for AnyQueryBuilder.
   * `QB extends unknown` below serves the same purpose as in
   * WithGraphModelQueryBuilder.
   */
  type WithGraphQueryBuilder<QB extends AnyQueryBuilder, E> = WithGraphTreeQueryBuilder<
    QB,
    ParseRelationExpression<E>
  >;

  type WithGraphTreeQueryBuilder<QB extends AnyQueryBuilder, T> = [keyof T] extends [never]
    ? QB
    : QB extends unknown
      ? 0 extends 1 & ModelType<QB>
        ? QB
        : [FetchedRelations<ModelType<QB>, T>] extends [never]
          ? QB
          : WithResultKind<QB, WithGraph<ModelType<QB>, T>['QueryBuilderType']>
      : never;

  /**
   * Converts the query builder NQB to the same result kind as QB:
   * array, single, maybe-single or page.
   */
  type WithResultKind<QB extends AnyQueryBuilder, NQB extends AnyQueryBuilder> = [
    ResultType<QB>,
  ] extends [ModelType<QB>[]]
    ? ArrayQueryBuilder<NQB>
    : [ResultType<QB>] extends [ModelType<QB>]
      ? SingleQueryBuilder<NQB>
      : [ResultType<QB>] extends [ModelType<QB> | undefined]
        ? MaybeSingleQueryBuilder<NQB>
        : [ResultType<QB>] extends [Page<ModelType<QB>>]
          ? PageQueryBuilder<NQB>
          : QB;

  // Strict mode: opt-in checking of column names and values in queries.

  /**
   * Type configuration. Augment it to opt in to stricter typings:
   *
   * ```ts
   * declare module 'objection' {
   *   interface TypeConfig {
   *     strict: true;
   *   }
   * }
   * ```
   */
  export interface TypeConfig {}

  type IsStrict = TypeConfig extends { strict: true } ? true : false;

  /**
   * Resolves to Loose, or to Strict in strict mode. As IsStrict isn't
   * generic, this resolves eagerly and leaves the loose types unchanged.
   */
  type IfStrict<Loose, Strict> = IsStrict extends true ? Strict : Loose;

  type IsAny<T> = 0 extends 1 & T ? true : false;

  /**
   * In strict mode, the column scope of a query travels on its query builder
   * type as the phantom `~scope` member. Scopes added by chained calls are
   * intersected, so all parts are keyed objects or flags:
   *
   * - `tables`: joined relations by alias ('pets', 'pets:owner') -> model.
   * - `names`: names for the root table (table name, `alias()`). Without
   *   any, columns can be qualified with any name.
   * - `output`: aliases of selections, for `orderBy()`, `groupBy()` and
   *   `having()`.
   * - `open`: any column is accepted, after plain joins, `from()`, `with()`.
   * - `openOutput`: any output alias is accepted, after raw or subquery
   *   selections.
   */
  interface QueryScope {
    tables?: {};
    names?: {};
    output?: {};
    open?: true;
    openOutput?: true;
  }

  type WithScope<QB, S extends QueryScope> = QB & { '~scope': S };

  type ScopeOf<QB> = QB extends { '~scope': infer S } ? S : {};

  /**
   * Carries the scope of QB over to the query builder NQB, e.g. when the
   * result kind changes with `first()`, or the model with `withGraph*()`.
   * This is an unconditional intersection, as with a generic QB, a deferred
   * conditional type would expose a union of both branches, on which the
   * overloaded methods can't be called anymore.
   */
  type CarryScope<QB, NQB> = NQB & { '~scope': ScopeOf<QB> };

  type OpenScope<QB> = WithScope<QB, { open: true }>;

  /**
   * The column names of model M: its non-function, non-relation properties.
   * Unlike ModelProps, relations are detected by the `$modelClass` key, as
   * structural `extends Model` checks would circle back through the query
   * builder types of the related models.
   */
  type ColumnName<M> =
    IsAny<M> extends true
      ? string
      : {
          [K in keyof M]-?: K extends 'QueryBuilderType'
            ? never
            : M[K] extends Function
              ? never
              : IsRelationProperty<M[K]> extends true
                ? never
                : K;
        }[keyof M] &
          string;

  type IsModelLike<T> = T extends object
    ? string extends keyof T
      ? false
      : '$modelClass' extends keyof T
        ? true
        : false
    : false;

  type IsRelationProperty<P> =
    Defined<NonNullable<P>> extends infer T
      ? T extends readonly (infer I)[]
        ? IsModelLike<I>
        : IsModelLike<T>
      : false;

  type ScopeTables<S> = S extends { tables: infer T } ? T : {};

  type ScopeNames<S> = S extends { names: infer N } ? keyof N & string : string;

  type ScopeOutput<S> = S extends { output: infer O } ? keyof O & string : never;

  /**
   * 'concrete' for concrete model types, 'open' for `any`. For generic model
   * types, e.g. through `this` in model or custom query builder methods, it
   * stays unresolved, and so do the conditional types that check it. As its
   * permissive instantiation (type parameters as `any`) is 'open', TS then
   * only relates arguments to their 'open' branch, so generic code is checked
   * loosely, as in the loose typings. The tuple keeps the permissive
   * instantiation from collapsing to a wildcard instead of evaluating.
   */
  type ScopeKind<QB extends AnyQueryBuilder> = [ModelType<QB>] extends [{ '~anyModel': true }]
    ? 'open'
    : 'concrete';

  /**
   * The scope is open after plain joins etc., and for models without any
   * declared columns, e.g. the base Model in untyped modifiers.
   */
  type IsOpenScope<QB extends AnyQueryBuilder> =
    ScopeOf<QB> extends { open: true }
      ? true
      : [ColumnName<ModelType<QB>>] extends [never]
        ? true
        : false;

  type ColumnScope = 'input' | 'output';

  /**
   * The columns that can be referenced in QB: the columns of the root model,
   * unqualified or qualified with a root table name, and the columns of the
   * joined relations qualified with their aliases. With the 'output' scope,
   * aliases of selections are accepted too.
   */
  type ScopeColumn<QB extends AnyQueryBuilder, Sc extends ColumnScope = 'input'> =
    ScopeKind<QB> extends 'concrete'
      ? IsOpenScope<QB> extends true
        ? string
        : | ScopeColumnOf<ModelType<QB>, ScopeOf<QB>>
          | (Sc extends 'output' ? OutputColumn<QB> : never)
      : string;

  type ScopeColumnOf<M, S> =
    ColumnName<M> | `${ScopeNames<S>}.${ColumnName<M>}` | TableColumns<ScopeTables<S>>;

  type TableColumns<T> = {
    [A in keyof T & string]: `${A}.${ColumnName<T[A]>}`;
  }[keyof T & string];

  type OutputColumn<QB> =
    ScopeOf<QB> extends { openOutput: true } ? string : ScopeOutput<ScopeOf<QB>>;

  /**
   * The names that tables can be referenced by in QB, e.g. for 'pets.*'.
   */
  type ScopeTableName<QB extends AnyQueryBuilder> =
    ScopeKind<QB> extends 'concrete'
      ? IsOpenScope<QB> extends true
        ? string
        : ScopeNames<ScopeOf<QB>> | (keyof ScopeTables<ScopeOf<QB>> & string)
      : string;

  /**
   * Any column in generic code, and none for concrete query builders. Used in
   * non-generic fallback overloads: on a union of query builders, which TS
   * exposes for some deferred types in generic code, only non-generic
   * signatures can be called.
   */
  type GenericColumn<QB extends AnyQueryBuilder> =
    ScopeKind<QB> extends 'concrete' ? never : string;

  /**
   * Column references accepted where column values aren't involved.
   */
  type StrictColumnRef<QB extends AnyQueryBuilder, Sc extends ColumnScope = 'input'> =
    ScopeColumn<QB, Sc> | Raw | ReferenceBuilder;

  /**
   * The property type of column C in QB, or unknown if it can't be resolved.
   */
  type ScopeColumnType<QB extends AnyQueryBuilder, C> =
    IsOpenScope<QB> extends true
      ? unknown
      : ColumnTypeOf<ModelType<QB>, ScopeTables<ScopeOf<QB>>, C>;

  type ColumnTypeOf<M, T, C> = C extends `${infer A}.${infer Col}`
    ? A extends keyof T
      ? PropertyType<T[A], Col>
      : PropertyType<M, Col>
    : PropertyType<M, C>;

  type PropertyType<M, K> = K extends keyof M ? M[K] : unknown;

  /**
   * The values accepted for a column of type T in conditions. `null` is
   * always accepted, as `where(col, null)` checks for NULL. Dates accept
   * strings too, and object (JSON) columns anything.
   */
  type ColumnValue<T> = unknown extends T ? PrimitiveValue : ConditionValue<Defined<T>> | null;

  type ConditionValue<T> = T extends Date
    ? Date | string
    : T extends readonly unknown[]
      ? T
      : T extends object
        ? PrimitiveValue | object
        : T;

  type StrictValue<QB extends AnyQueryBuilder, C> =
    ScopeKind<QB> extends 'concrete'
      ? Expression<ColumnValue<ScopeColumnType<QB, C>>>
      : Expression<PrimitiveValue>;

  /**
   * With an operator, arrays are accepted too, for 'in' and 'between'.
   */
  type StrictOperatorValue<QB extends AnyQueryBuilder, C> =
    StrictValue<QB, C> | readonly StrictValue<QB, C>[];

  type StrictWhereObject<QB extends AnyQueryBuilder, Sc extends ColumnScope> =
    ScopeKind<QB> extends 'concrete'
      ? IsOpenScope<QB> extends true
        ? object
        : { [C in ScopeColumn<QB, Sc>]?: StrictValue<QB, C> }
      : object;

  /**
   * Adds the output aliases of the selections X to the scope of QB:
   * 'col as alias' adds 'alias', raw and subquery selections open it.
   */
  type SelectScope<QB, X> = [SelectAlias<X>, SelectOpensOutput<X>] extends [never, never]
    ? QB
    : WithScope<
        QB,
        { output: { [A in SelectAlias<X>]: true } } & ([SelectOpensOutput<X>] extends [never]
          ? {}
          : { openOutput: true })
      >;

  /**
   * The output aliases of a selection: 'col as alias' and `{ alias: col }`.
   */
  type SelectAlias<X> = X extends string
    ? X extends `${string} as ${infer A}`
      ? Trim<A>
      : X extends `${string} AS ${infer A}`
        ? Trim<A>
        : never
    : X extends Raw | ReferenceBuilder | AnyQueryBuilder | Function | number
      ? never
      : X extends object
        ? keyof X & string
        : never;

  /**
   * Raw, `ref()` and subquery selections can have any alias.
   */
  type SelectOpensOutput<X> = X extends Raw | ReferenceBuilder | AnyQueryBuilder | Function
    ? true
    : never;

  type OutputScope<QB, A> = [A] extends [never]
    ? QB
    : WithScope<QB, { output: { [K in A & string]: true } }>;

  /**
   * Adds the relations joined with relation expression E on model M to the
   * scope, by the aliases objection uses for them: 'pets', 'pets:owner', or
   * 'p' for 'pets as p'. Expressions that can't be resolved open the scope.
   */
  type JoinScope<M, E> =
    IsAny<M> extends true
      ? {}
      : string extends E
        ? { open: true }
        : JoinTreeScope<ParseRelationExpression<E, 'join'>, M>;

  type JoinTreeScope<T, M> = [keyof T] extends [never]
    ? { open: true }
    : JoinEntries<M, T, ''> extends infer En
      ? [Extract<En, { open: true }>] extends [never]
        ? {
            tables: {
              [X in En & { alias: string; model: unknown } as X['alias']]: X['model'];
            };
          }
        : { open: true }
      : never;

  type JoinEntries<M, T, P extends string> = {
    [K in keyof T & string]: JoinNode<K> extends [infer R extends string, infer A extends string]
      ? string extends R | A
        ? { open: true }
        : [R, A] extends [UnparsedNode, any] | [any, UnparsedNode]
          ? { open: true }
          : JoinEntry<RelatedModel<PropertyType<M, R>>, R, `${P}${A}`, T[K]>
      : { open: true };
  }[keyof T & string];

  /**
   * Nodes that aren't parsed, e.g. '*', recursion and malformed aliases, open
   * the scope and aren't checked.
   */
  type UnparsedNode = '' | '*' | `^${string}` | `${string}${Whitespace}${string}`;

  type JoinEntry<RM, R extends string, A extends string, C> = [RM] extends [never]
    ? { open: true; unknown: R }
    : { alias: A; model: RM } | JoinEntries<RM, C, `${A}:`>;

  /**
   * The names in relation expression E that aren't relations of model M.
   */
  type UnknownRelations<M, E> = string extends E
    ? never
    : JoinEntries<M, ParseRelationExpression<E, 'join'>, ''> extends infer En
      ? En extends { unknown: infer R }
        ? R
        : never
      : never;

  /**
   * Intersected with relation expressions in strict mode, to reject unknown
   * relations. Models without declared columns and generic code (see
   * ScopeKind) aren't checked.
   */
  type CheckRelationExpression<QB extends AnyQueryBuilder, E> =
    ScopeKind<QB> extends 'concrete'
      ? [ColumnName<ModelType<QB>>] extends [never]
        ? unknown
        : [UnknownRelations<ModelType<QB>, E>] extends [never]
          ? unknown
          : { '~unknownRelation': UnknownRelations<ModelType<QB>, E> }
      : unknown;

  /**
   * Splits a node of a join mode tree into relation name and alias:
   * 'pets(mod) as p' -> ['pets', 'p'], 'pets' -> ['pets', 'pets'].
   */
  type JoinNode<K extends string> = K extends `${infer R} as ${infer A}`
    ? [JoinRelationName<R>, Trim<A>]
    : [JoinRelationName<K>, JoinRelationName<K>];

  type JoinRelationName<S extends string> =
    Trim<S> extends `${infer N}(${string})` ? Trim<N> : Trim<S>;

  /**
   * The model of a relation property, or never if it isn't one.
   */
  type RelatedModel<P> =
    Defined<NonNullable<P>> extends infer T
      ? T extends readonly (infer I)[]
        ? IsModelLike<I> extends true
          ? I
          : never
        : IsModelLike<T> extends true
          ? T
          : never
      : never;

  /**
   * Options that change the aliases of joined relations open the scope.
   */
  type JoinOptionsScope<O, Keys extends string> = [keyof O & Keys] extends [never]
    ? never
    : { open: true };

  type JoinRelatedScope<QB extends AnyQueryBuilder, E, O> = WithScope<
    QB,
    [JoinOptionsScope<O, 'alias' | 'aliases'>] extends [never]
      ? JoinScope<ModelType<QB>, E>
      : { open: true }
  >;

  /**
   * The query builder after `withGraphJoined(E, O)` in strict mode: the
   * narrowed query builder with the scope of QB plus the joined relations.
   */
  type StrictWithGraphJoined<QB extends AnyQueryBuilder, E, O> = WithScope<
    CarryScope<QB, WithGraphQueryBuilder<QB, E>>,
    [JoinOptionsScope<O, 'aliases' | 'separator' | 'minimize'>] extends [never]
      ? JoinScope<ModelType<QB>, E>
      : { open: true }
  >;

  /**
   * The query builder of `Model.query()` in strict mode: with a literal
   * `static tableName`, e.g. `static tableName = 'persons' as const`, root
   * columns can only be qualified with that name (or an `alias()`).
   */
  type RootQueryBuilder<QB, T> = string extends T
    ? QB
    : WithScope<QB, { names: { [K in T & string]: true } }>;

  /**
   * If T is an array, returns the item type, otherwise returns T.
   */
  type ItemType<T> = T extends Array<unknown> ? T[number] : T;

  /**
   * Type for keys of non-function properties of T.
   */
  type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];

  /**
   * Type that attempts to only select the user-defined model properties.
   */
  type DataPropertyNames<T> = Exclude<NonFunctionPropertyNames<T>, 'QueryBuilderType'>;

  /**
   * Removes `undefined` from a type.
   */
  type Defined<T> = Exclude<T, undefined>;

  /**
   * A Pojo version of model.
   */
  type ModelObject<T extends Model> = Pick<T, DataPropertyNames<T>>;

  /**
   * Any object that has some of the properties of model class T match this type.
   */
  type PartialModelObject<T extends Model> = {
    [K in DataPropertyNames<T>]?: Defined<T[K]> extends Model
      ? T[K] | PartialModelObject<Defined<T[K]>>
      : Defined<T[K]> extends Array<infer I>
        ? I extends Model
          ? I[] | PartialModelObject<I>[]
          : Expression<T[K]>
        : Expression<T[K]>;
  };

  /**
   * Like PartialModelObject, but relation properties are not allowed. Unlike
   * PartialModelObject, this doesn't depend on the relation types, so query
   * builders for models with narrowed relations (see WithGraphModel) remain
   * assignable to the query builders for the plain models.
   */
  type PartialModelProps<T extends Model> = {
    [K in DataPropertyNames<T>]?: Defined<T[K]> extends Model | Model[] ? never : Expression<T[K]>;
  };

  /**
   * Additional optional parameters that may be used in graphs.
   */
  type GraphParameters = {
    '#dbRef'?: MaybeCompositeId;
    '#ref'?: string;
    '#id'?: string;
    '#unrelate'?: boolean;
    '#delete'?: boolean;
  };

  /**
   * Just like PartialModelObject but this is applied recursively to relations.
   */
  type PartialModelGraph<M, T = M & GraphParameters> = T extends any
    ? {
        [K in DataPropertyNames<T>]?: null extends T[K]
          ? PartialModelGraphField<NonNullable<T[K]>> | null // handle nullable BelongsToOneRelations
          : PartialModelGraphField<T[K]>;
      }
    : never;

  type PartialModelGraphField<F> =
    Defined<F> extends Model
      ? PartialModelGraph<Defined<F>>
      : Defined<F> extends Array<infer I>
        ? I extends Model
          ? PartialModelGraph<I>[]
          : Expression<F>
        : Expression<F>;

  /**
   * Extracts the property names (excluding relations) of a model class.
   */
  type ModelProps<T extends Model> = Exclude<
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
    undefined | 'QueryBuilderType'
  >;

  /**
   * Extracts the relation names of the a model class.
   */
  type ModelRelations<T extends Model> = Defined<
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
   * correct kind if the property is a model or a model array.
   */
  type RelatedQueryBuilder<T> = T extends Model
    ? SingleQueryBuilder<QueryBuilderType<T>>
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
  type ArrayRelatedQueryBuilder<T> = T extends Model
    ? QueryBuilderType<T>
    : T extends Array<infer I>
      ? I extends Model
        ? QueryBuilderType<I>
        : never
      : never;

  /**
   * Gets the query builder type for a model type.
   */
  type QueryBuilderType<T extends { QueryBuilderType: any }> = T['QueryBuilderType'];

  /**
   * Gets the model type from a query builder type.
   */
  type ModelType<T extends { ModelType: any }> = T['ModelType'];

  /**
   * Gets the result type from a query builder type.
   */
  type ResultType<T extends { ResultType: any }> = T['ResultType'];

  /**
   * Gets the single item query builder type for a query builder.
   */
  type SingleQueryBuilder<T extends { SingleQueryBuilderType: any }> = IfStrict<
    T['SingleQueryBuilderType'],
    CarryScope<T, T['SingleQueryBuilderType']>
  >;

  /**
   * Gets the single or undefined item query builder type for a query builder.
   */
  type MaybeSingleQueryBuilder<QB extends AnyQueryBuilder> = IfStrict<
    QB['MaybeSingleQueryBuilderType'],
    CarryScope<QB, QB['MaybeSingleQueryBuilderType']>
  >;

  /**
   * Gets the multi-item query builder type for a query builder.
   */
  type ArrayQueryBuilder<T extends { ArrayQueryBuilderType: any }> = IfStrict<
    T['ArrayQueryBuilderType'],
    CarryScope<T, T['ArrayQueryBuilderType']>
  >;

  /**
   * Gets the number query builder type for a query builder.
   */
  type NumberQueryBuilder<T extends { NumberQueryBuilderType: any }> = IfStrict<
    T['NumberQueryBuilderType'],
    CarryScope<T, T['NumberQueryBuilderType']>
  >;

  /**
   * Gets the page query builder type for a query builder.
   */
  type PageQueryBuilder<T extends { PageQueryBuilderType: any }> = IfStrict<
    T['PageQueryBuilderType'],
    CarryScope<T, T['PageQueryBuilderType']>
  >;

  interface ForClassMethod {
    <M extends Model>(modelClass: ModelConstructor<M>): QueryBuilderType<M>;
  }

  /**
   * https://ditojs.github.io/objection/api/types/#type-fieldexpression
   */
  type FieldExpression = string;

  type JsonObjectOrFieldExpression = object | object[] | FieldExpression;

  type Selection<QB extends AnyQueryBuilder> = ColumnRef | AnyQueryBuilder | CallbackVoid<QB>;

  interface SelectMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(...columns: ModelProps<ModelType<QBP>>[]): QB;
    <QBP extends QB>(columns: ModelProps<ModelType<QBP>>[]): QB;

    <QBP extends QB>(...columns: Selection<QBP>[]): QB;
    <QBP extends QB>(columns: Selection<QBP>[]): QB;

    // Allows things like `select(1)`, not sure if we should be more specific here?
    <QBP extends QB>(...args: any[]): QB;
  }

  interface AsMethod<QB extends AnyQueryBuilder> {
    (alias: string): QB;
  }

  interface FromMethod<QB extends AnyQueryBuilder> {
    (table: TableRef<QB>): QB;
  }

  interface FromRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface JsonExtraction {
    column: string | Raw | Knex.QueryBuilder;
    path: string;
    alias?: string;
    singleValue?: boolean;
  }

  interface JsonExtract<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      column: ModelProps<ModelType<QBP>>,
      path: string,
      alias?: string,
      singleValue?: boolean,
    ): QB;

    (column: ColumnRef, path: string, alias?: string, singleValue?: boolean): QB;
    (column: JsonExtraction[] | any[][], singleValue?: boolean): QB;
  }

  interface JsonSet<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      column: ModelProps<ModelType<QBP>>,
      path: string,
      value: any,
      alias?: string,
    ): QB;

    (column: ColumnRef, path: string, value: any, alias?: string): QB;
  }

  interface JsonInsert<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      column: ModelProps<ModelType<QBP>>,
      path: string,
      value: any,
      alias?: string,
    ): QB;

    (column: ColumnRef, path: string, value: any, alias?: string): QB;
  }

  interface JsonRemove<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(column: ModelProps<ModelType<QBP>>, path: string, alias?: string): QB;

    (column: ColumnRef, path: string, alias?: string): QB;
  }

  interface WhereMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      col: ModelProps<ModelType<QBP>>,
      op: Operator,
      expr: Expression<PrimitiveValue>,
    ): QB;

    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, expr: Expression<PrimitiveValue>): QB;

    (col: ColumnRef, op: Operator, expr: Expression<PrimitiveValue>): QB;
    (col: ColumnRef, expr: Expression<PrimitiveValue>): QB;

    (condition: boolean): QB;
    (cb: CallbackVoid<QB>): QB;
    (raw: Raw): QB;
    <QBA extends AnyQueryBuilder>(qb: QBA): QB;

    (obj: PartialModelProps<ModelType<QB>>): QB;
    // We must allow any keys in the object. The previous type
    // is kind of useless, but maybe one day vscode and other
    // tools can autocomplete using it.
    (obj: object): QB;
  }

  interface WhereRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface WhereWrappedMethod<QB extends AnyQueryBuilder> {
    (cb: CallbackVoid<QB>): QB;
  }

  interface WhereExistsMethod<QB extends AnyQueryBuilder> {
    (cb: CallbackVoid<QB>): QB;
    (raw: Raw): QB;
    <QBA extends AnyQueryBuilder>(qb: QBA): QB;
  }

  interface WhereInMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, expr: Expression<PrimitiveValue>): QB;
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, cb: CallbackVoid<QB>): QB;
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, qb: AnyQueryBuilder): QB;

    (col: ColumnRef | ColumnRef[], expr: readonly Expression<PrimitiveValue>[]): QB;
    (col: ColumnRef | ColumnRef[], cb: CallbackVoid<QB>): QB;
    (col: ColumnRef | ColumnRef[], qb: AnyQueryBuilder): QB;
  }

  interface WhereBetweenMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef, range: [Expression<PrimitiveValue>, Expression<PrimitiveValue>]): QB;
  }

  interface WhereNullMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef): QB;
  }

  interface WhereColumnMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(col1: ModelProps<ModelType<QBP>>, op: Operator, col2: ColumnRef): QB;
    <QBP extends QB>(col1: ModelProps<ModelType<QBP>>, col2: ColumnRef): QB;

    (col1: ColumnRef, op: Operator, col2: ColumnRef): QB;
    (col1: ColumnRef, col2: ColumnRef): QB;
  }

  interface WhereJsonObject<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, value: any): QB;

    (col: ColumnRef, value: any): QB;
  }

  interface WhereJsonPath<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      col: ModelProps<ModelType<QBP>>,
      jsonPath: string,
      operator: string,
      value: any,
    ): QB;

    (col: ColumnRef, jsonPath: string, operator: string, value: any): QB;
  }

  interface WhereJsonMethod<QB extends AnyQueryBuilder> {
    (
      fieldExpression: FieldExpression,
      jsonObjectOrFieldExpression: JsonObjectOrFieldExpression,
    ): QB;
  }

  interface WhereFieldExpressionMethod<QB extends AnyQueryBuilder> {
    (fieldExpression: FieldExpression): QB;
  }

  interface WhereJsonExpressionMethod<QB extends AnyQueryBuilder> {
    (fieldExpression: FieldExpression, keys: string | string[]): QB;
  }

  interface WhereJsonField<QB extends AnyQueryBuilder> {
    (
      fieldExpression: FieldExpression,
      operator: string,
      value: boolean | number | string | null,
    ): QB;
  }

  interface WhereCompositeMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef[], op: Operator, expr: readonly Expression<PrimitiveValue>[]): QB;
    (column: ColumnRef, expr: Expression<PrimitiveValue>): QB;
    (column: ColumnRef, op: Operator, expr: Expression<PrimitiveValue>): QB;
    (column: ColumnRef[], expr: readonly Expression<PrimitiveValue>[]): QB;
    (column: ColumnRef[], qb: AnyQueryBuilder): QB;
  }

  interface WhereInCompositeMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef, expr: readonly Expression<PrimitiveValue>[]): QB;
    (column: ColumnRef, qb: AnyQueryBuilder): QB;
    (column: ColumnRef[], expr: readonly Expression<PrimitiveValue>[][]): QB;
    (column: ColumnRef[], qb: AnyQueryBuilder): QB;
  }

  type QBOrCallback<QB extends AnyQueryBuilder> = AnyQueryBuilder | CallbackVoid<QB>;

  interface BaseSetOperations<QB extends AnyQueryBuilder> {
    (callbackOrBuilder: QBOrCallback<QB>, wrap?: boolean): QB;
    (callbacksOrBuilders: QBOrCallback<QB>[], wrap?: boolean): QB;
  }

  interface SetOperationsMethod<QB extends AnyQueryBuilder> extends BaseSetOperations<QB> {
    (...callbacksOrBuilders: QBOrCallback<QB>[]): QB;
  }

  interface UnionMethod<QB extends AnyQueryBuilder> extends BaseSetOperations<QB> {
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

  interface WithMethod<QB extends AnyQueryBuilder> {
    (alias: string, expr: CallbackVoid<QB> | AnyQueryBuilder | Raw): QB;
    (alias: string, columns: string[], expr: CallbackVoid<QB> | AnyQueryBuilder | Raw): QB;
  }

  interface JoinRelatedOptions {
    alias?: string | boolean;
    aliases?: Record<string, string>;
  }

  interface JoinRelatedMethod<QB extends AnyQueryBuilder> {
    (expr: RelationExpression<ModelType<QB>>, opt?: JoinRelatedOptions): QB;
  }

  interface JoinMethod<QB extends AnyQueryBuilder> {
    (table: TableRef<QB>, leftCol: ColumnRef, op: Operator, rightCol: ColumnRef): QB;
    (table: TableRef<QB>, leftCol: ColumnRef, rightCol: ColumnRef): QB;
    (table: TableRef<QB>, cb: CallbackVoid<Knex.JoinClause>): QB;
    (table: TableRef<QB>, columns: { [leftCol: string]: ColumnRef }): QB;
    (table: TableRef<QB>, raw: Raw): QB;
    (raw: Raw): QB;
  }

  interface JoinRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface IncrementDecrementMethod<QB extends AnyQueryBuilder> {
    (column: string, amount?: number): QB;
  }

  interface AggregateMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef): QB;
    (aliasToColumnDict: { [alias: string]: ColumnRef }): QB;
  }

  interface CountMethod<QB extends AnyQueryBuilder> {
    (column?: ColumnRef, options?: { as: string }): QB;
    (aliasToColumnDict: { [alias: string]: string | string[] }): QB;
    (...columns: ColumnRef[]): QB;
  }

  interface GroupByMethod<QB extends AnyQueryBuilder> {
    (...columns: ColumnRef[]): QB;
    (columns: ColumnRef[]): QB;
  }

  interface OrderByDescriptor {
    column: ColumnRef;
    order?: OrderByDirection;
    nulls?: OrderByNulls;
  }

  type ColumnRefOrOrderByDescriptor = ColumnRef | OrderByDescriptor;

  interface OrderByMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef, order?: OrderByDirection, nulls?: OrderByNulls): QB;
    (columns: ColumnRefOrOrderByDescriptor[]): QB;
  }

  interface OrderByRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface FirstMethod {
    <QB extends AnyQueryBuilder>(
      this: QB,
    ): [ResultType<QB>] extends [any[]] ? MaybeSingleQueryBuilder<QB> : QB;
  }

  type ForIdValue = MaybeCompositeId | AnyQueryBuilder;

  interface AllowGraphMethod<QB extends AnyQueryBuilder> {
    (expr: RelationExpression<ModelType<QB>>): QB;
  }

  interface IdentityMethod<QB extends AnyQueryBuilder> {
    (): QB;
  }

  interface OneArgMethod<T, QB extends AnyQueryBuilder> {
    (arg: T): QB;
  }

  interface StringReturningMethod {
    (): string;
  }

  interface BooleanReturningMethod {
    (): boolean;
  }

  interface HasMethod {
    (selector: string | RegExp): boolean;
  }

  interface ClearMethod<QB extends AnyQueryBuilder> {
    (selector: string | RegExp): QB;
  }

  interface ColumnInfoMethod<QB extends AnyQueryBuilder> {
    (): Promise<Knex.ColumnInfo>;
  }

  interface TableRefForMethod {
    (modelClassOrTableName: string | AnyModelConstructor): string;
  }

  interface AliasForMethod<QB extends AnyQueryBuilder> {
    (modelClassOrTableName: string | AnyModelConstructor): string | null;
    (modelClassOrTableName: string | AnyModelConstructor, alias: string): QB;
  }

  interface ModelClassMethod<M extends Model> {
    (): ModelClass<M>;
  }

  interface ReturningOptions {
    includeTriggerModifications?: boolean;
  }

  interface ReturningMethod {
    <QB extends AnyQueryBuilder>(
      this: QB,
      column: string | Raw | (string | Raw)[] | readonly (string | Raw)[],
      options?: ReturningOptions,
    ): QB extends NumberQueryBuilder<QB> ? ArrayQueryBuilder<QB> : QB;
  }

  interface TimeoutOptions {
    cancel: boolean;
  }

  interface TimeoutMethod<QB extends AnyQueryBuilder> {
    (ms: number, options?: TimeoutOptions): QB;
  }

  export interface Page<M extends Model> {
    total: number;
    results: M[];
  }

  interface RunBeforeCallback<QB extends AnyQueryBuilder> {
    (this: QB, result: any, query: QB): any;
  }

  interface RunBeforeMethod<QB extends AnyQueryBuilder> {
    (cb: RunBeforeCallback<QB>): QB;
  }

  interface RunAfterCallback<QB extends AnyQueryBuilder> {
    (this: QB, result: ResultType<QB>, query: QB): any;
  }

  interface RunAfterMethod<QB extends AnyQueryBuilder> {
    (cb: RunAfterCallback<QB>): QB;
  }

  interface OnBuildMethod<QB extends AnyQueryBuilder> {
    (cb: CallbackVoid<QB>): QB;
  }

  interface OnBuildKnexCallback<QB extends AnyQueryBuilder> {
    (this: QB, knexQuery: Knex.QueryBuilder, query: QB): void;
  }

  interface OnBuildKnexMethod<QB extends AnyQueryBuilder> {
    (cb: OnBuildKnexCallback<QB>): QB;
  }

  interface OnErrorCallback<QB extends AnyQueryBuilder> {
    (this: QB, error: Error, query: QB): any;
  }

  interface OnErrorMethod<QB extends AnyQueryBuilder> {
    (cb: OnErrorCallback<QB>): QB;
  }

  export interface InsertGraphOptions {
    relate?: boolean | string[];
    allowRefs?: boolean;
  }

  interface InsertGraphMethod<M extends Model> {
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
    relate?: boolean | string[];
    unrelate?: boolean | string[];
    insertMissing?: boolean | string[];
    update?: boolean | string[];
    noInsert?: boolean | string[];
    noUpdate?: boolean | string[];
    noDelete?: boolean | string[];
    noRelate?: boolean | string[];
    noUnrelate?: boolean | string[];
    allowRefs?: boolean;
  }

  interface UpsertGraphMethod<M extends Model> {
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

  interface GraphExpressionObjectMethod<QB extends AnyQueryBuilder> {
    (): any;
  }

  export interface GraphOptions {
    minimize?: boolean;
    separator?: string;
    aliases?: { [key: string]: string };
    joinOperation?: string;
    maxBatchSize?: number;
  }

  export interface WithGraphOptions extends GraphOptions {
    algorithm?: 'fetch' | 'join';
  }

  interface ModifyGraphMethod<QB extends AnyQueryBuilder> {
    <M extends Model>(
      expr: RelationExpression<ModelType<QB>>,
      modifier: Modifier<QueryBuilderType<M>>,
    ): QB;
  }

  interface ContextMethod<QB extends AnyQueryBuilder> {
    (context: object): QB;
    (): QueryContext;
  }

  interface ClearContextMethod<QB extends AnyQueryBuilder> {
    (): QB;
  }

  interface ModifyMethod<QB extends AnyQueryBuilder> {
    (modifier: Modifier<QB> | Modifier<QB>[], ...args: any[]): QB;
  }

  interface ModifiersMethod<QB extends AnyQueryBuilder> {
    (modifiers: Modifiers): QB;
    (): QB;
  }

  // Strict mode versions of the query builder methods that take columns, see
  // ScopeColumn. Raw and `ref()` are always accepted, `ref()` being the way
  // to refer to columns outside of the scope, e.g. of an outer query.
  //
  // As in the loose methods, the column types are taken from `QBP extends QB`
  // instead of QB, which keeps these interfaces covariant in QB, so that e.g.
  // custom query builders remain assignable to QueryBuilder.

  interface StrictWhereMethod<QB extends AnyQueryBuilder, Sc extends ColumnScope = 'input'> {
    <QBP extends QB, C extends ScopeColumn<QBP, Sc> = never>(
      col: C,
      op: Operator,
      expr: StrictOperatorValue<QBP, C>,
    ): QB;
    <QBP extends QB, C extends ScopeColumn<QBP, Sc> = never>(col: C, expr: StrictValue<QBP, C>): QB;

    (
      col: Raw | ReferenceBuilder | GenericColumn<QB>,
      op: Operator,
      expr: Expression<PrimitiveValue>,
    ): QB;
    (col: Raw | ReferenceBuilder | GenericColumn<QB>, expr: Expression<PrimitiveValue>): QB;

    (condition: boolean): QB;
    (cb: CallbackVoid<QB>): QB;
    (raw: Raw): QB;
    <QBA extends AnyQueryBuilder>(qb: QBA): QB;

    <QBP extends QB>(obj: StrictWhereObject<QBP, Sc>): QB;
  }

  interface StrictWhereLikeMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(col: StrictColumnRef<QBP>, expr: Expression<string>): QB;
    (col: GenericColumn<QB>, expr: Expression<string>): QB;
  }

  interface StrictWhereInMethod<QB extends AnyQueryBuilder, Sc extends ColumnScope = 'input'> {
    <QBP extends QB, C extends ScopeColumn<QBP, Sc> = never>(
      col: C,
      expr: readonly StrictValue<QBP, C>[] | Raw | AnyQueryBuilder | CallbackVoid<QB>,
    ): QB;
    <QBP extends QB>(
      col: Raw | ReferenceBuilder | readonly StrictColumnRef<QBP, Sc>[],
      expr: readonly Expression<PrimitiveValue>[] | Raw | AnyQueryBuilder | CallbackVoid<QB>,
    ): QB;
    (
      col: GenericColumn<QB> | readonly GenericColumn<QB>[],
      expr: readonly Expression<PrimitiveValue>[] | Raw | AnyQueryBuilder | CallbackVoid<QB>,
    ): QB;
  }

  interface StrictWhereBetweenMethod<QB extends AnyQueryBuilder, Sc extends ColumnScope = 'input'> {
    <QBP extends QB, C extends ScopeColumn<QBP, Sc> = never>(
      col: C,
      range: [StrictValue<QBP, C>, StrictValue<QBP, C>],
    ): QB;
    (
      col: Raw | ReferenceBuilder | GenericColumn<QB>,
      range: [Expression<PrimitiveValue>, Expression<PrimitiveValue>],
    ): QB;
  }

  interface StrictWhereNullMethod<QB extends AnyQueryBuilder, Sc extends ColumnScope = 'input'> {
    <QBP extends QB>(column: StrictColumnRef<QBP, Sc>): QB;
    (column: GenericColumn<QB>): QB;
  }

  interface StrictWhereColumnMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(col1: StrictColumnRef<QBP>, op: Operator, col2: StrictColumnRef<QBP>): QB;
    <QBP extends QB>(col1: StrictColumnRef<QBP>, col2: StrictColumnRef<QBP>): QB;
  }

  /**
   * Field expressions: a column in scope, optionally followed by a JSON
   * path, 'column:path.to.key'.
   */
  type StrictFieldExpression<QB extends AnyQueryBuilder> =
    ScopeColumn<QB> | `${ScopeColumn<QB>}:${string}`;

  interface StrictWhereJsonMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(
      fieldExpression: StrictFieldExpression<QBP>,
      jsonObjectOrFieldExpression: JsonObjectOrFieldExpression,
    ): QB;
  }

  interface StrictWhereFieldExpressionMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(fieldExpression: StrictFieldExpression<QBP>): QB;
  }

  interface StrictWhereJsonExpressionMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(fieldExpression: StrictFieldExpression<QBP>, keys: string | string[]): QB;
  }

  interface StrictWhereJsonObject<QB extends AnyQueryBuilder> {
    <QBP extends QB>(col: StrictColumnRef<QBP>, value: any): QB;
  }

  interface StrictWhereJsonPath<QB extends AnyQueryBuilder> {
    <QBP extends QB>(col: StrictColumnRef<QBP>, jsonPath: string, operator: string, value: any): QB;
  }

  interface StrictWhereCompositeMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(
      column: readonly StrictColumnRef<QBP>[],
      op: Operator,
      expr: readonly Expression<PrimitiveValue>[],
    ): QB;
    <QBP extends QB, C extends ScopeColumn<QBP> = never>(column: C, expr: StrictValue<QBP, C>): QB;
    <QBP extends QB, C extends ScopeColumn<QBP> = never>(
      column: C,
      op: Operator,
      expr: StrictValue<QBP, C>,
    ): QB;
    <QBP extends QB>(
      column: readonly StrictColumnRef<QBP>[],
      expr: readonly Expression<PrimitiveValue>[],
    ): QB;
    <QBP extends QB>(column: readonly StrictColumnRef<QBP>[], qb: AnyQueryBuilder): QB;
  }

  interface StrictWhereInCompositeMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB, C extends ScopeColumn<QBP> = never>(
      column: C,
      expr: readonly StrictValue<QBP, C>[],
    ): QB;
    <QBP extends QB>(column: StrictColumnRef<QBP>, qb: AnyQueryBuilder): QB;
    <QBP extends QB>(
      column: readonly StrictColumnRef<QBP>[],
      expr: readonly (readonly Expression<PrimitiveValue>[])[],
    ): QB;
    <QBP extends QB>(column: readonly StrictColumnRef<QBP>[], qb: AnyQueryBuilder): QB;
  }

  /**
   * Selections: columns in scope, '*', 'table.*', and 'column as alias'.
   */
  type StrictSelection<QB extends AnyQueryBuilder> =
    | ScopeColumn<QB>
    | '*'
    | `${ScopeTableName<QB>}.*`
    | `${ScopeColumn<QB>} ${'as' | 'AS'} ${string}`
    | { [alias: string]: StrictColumnRef<QB> | AnyQueryBuilder }
    | number
    | Raw
    | ReferenceBuilder
    | AnyQueryBuilder
    | CallbackVoid<QB>;

  interface StrictSelectMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB, const C extends readonly StrictSelection<QBP>[] = []>(
      ...columns: C
    ): SelectScope<QB, C[number]>;
    <QBP extends QB, const C extends readonly StrictSelection<QBP>[] = []>(
      columns: C,
    ): SelectScope<QB, C[number]>;
    (...columns: (GenericColumn<QB> | Raw | ReferenceBuilder | AnyQueryBuilder)[]): QB;
  }

  type StrictAggregation<QB extends AnyQueryBuilder> =
    | ScopeColumn<QB>
    | '*'
    | `${ScopeColumn<QB> | '*'} ${'as' | 'AS'} ${string}`
    | Raw
    | ReferenceBuilder;

  type StrictAggregationObject<QB extends AnyQueryBuilder> = {
    [alias: string]: StrictAggregation<QB> | readonly StrictAggregation<QB>[];
  };

  interface StrictAggregateMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB, const C extends StrictAggregation<QBP> = never>(column: C): SelectScope<QB, C>;
    <QBP extends QB, const O extends StrictAggregationObject<QBP> = {}>(
      aliasToColumnDict: O,
    ): OutputScope<QB, keyof O>;
  }

  interface StrictCountMethod<QB extends AnyQueryBuilder> {
    <
      QBP extends QB,
      const C extends StrictAggregation<QBP> = never,
      const A extends string = never,
    >(
      column?: C,
      options?: { as: A },
    ): OutputScope<SelectScope<QB, C>, A>;
    <QBP extends QB, const O extends StrictAggregationObject<QBP> = {}>(
      aliasToColumnDict: O,
    ): OutputScope<QB, keyof O>;
    <QBP extends QB, const C extends readonly StrictAggregation<QBP>[] = []>(
      ...columns: C
    ): SelectScope<QB, C[number]>;
  }

  interface StrictGroupByMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(...columns: StrictColumnRef<QBP, 'output'>[]): QB;
    <QBP extends QB>(columns: readonly StrictColumnRef<QBP, 'output'>[]): QB;
    (...columns: GenericColumn<QB>[]): QB;
  }

  interface StrictOrderByDescriptor<QB extends AnyQueryBuilder> {
    column: StrictColumnRef<QB, 'output'>;
    order?: OrderByDirection;
    nulls?: OrderByNulls;
  }

  interface StrictOrderByMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(
      column: StrictColumnRef<QBP, 'output'>,
      order?: OrderByDirection,
      nulls?: OrderByNulls,
    ): QB;
    <QBP extends QB>(
      columns: readonly (StrictColumnRef<QBP, 'output'> | StrictOrderByDescriptor<QBP>)[],
    ): QB;
    (column: GenericColumn<QB>, order?: OrderByDirection, nulls?: OrderByNulls): QB;
  }

  interface StrictIncrementDecrementMethod<QB extends AnyQueryBuilder> {
    <QBP extends QB>(column: ScopeColumn<QBP>, amount?: number): QB;
  }

  interface StrictJoinRelatedMethod<QB extends AnyQueryBuilder> {
    <const E extends RelationExpression<ModelType<QB>>, const O extends JoinRelatedOptions = {}>(
      expr: E & CheckRelationExpression<QB, E>,
      opt?: O,
    ): JoinRelatedScope<QB, E, O>;
  }

  interface StrictAliasMethod<QB extends AnyQueryBuilder> {
    <const A extends string>(alias: A): WithScope<QB, { names: { [K in A]: true } }>;
  }

  export interface Pojo {
    [key: string]: any;
  }

  export interface CatchablePromiseLike<R> extends PromiseLike<R> {
    catch<FR = never>(
      onrejected?: ((reason: any) => FR | PromiseLike<FR>) | undefined | null,
    ): Promise<R | FR>;
  }

  /**
   * The query builder methods that differ in strict mode, merged into
   * QueryBuilder as `ScopedMethods<this>[name]`. Selecting them once per
   * query builder type, instead of per member, keeps the loose typings cheap.
   */
  interface LooseScopedMethods<QB extends AnyQueryBuilder> {
    select: SelectMethod<QB>;
    columns: SelectMethod<QB>;
    column: SelectMethod<QB>;
    distinct: SelectMethod<QB>;
    distinctOn: SelectMethod<QB>;
    from: FromMethod<QB>;
    table: FromMethod<QB>;
    into: FromMethod<QB>;
    fromRaw: FromRawMethod<QB>;
    where: WhereMethod<QB>;
    andWhere: WhereMethod<QB>;
    orWhere: WhereMethod<QB>;
    whereNot: WhereMethod<QB>;
    andWhereNot: WhereMethod<QB>;
    orWhereNot: WhereMethod<QB>;
    whereLike: WhereMethod<QB>;
    andWhereLike: WhereMethod<QB>;
    orWhereLike: WhereMethod<QB>;
    whereILike: WhereMethod<QB>;
    andWhereILike: WhereMethod<QB>;
    orWhereILike: WhereMethod<QB>;
    whereIn: WhereInMethod<QB>;
    orWhereIn: WhereInMethod<QB>;
    whereNotIn: WhereInMethod<QB>;
    orWhereNotIn: WhereInMethod<QB>;
    whereBetween: WhereBetweenMethod<QB>;
    orWhereBetween: WhereBetweenMethod<QB>;
    andWhereBetween: WhereBetweenMethod<QB>;
    whereNotBetween: WhereBetweenMethod<QB>;
    orWhereNotBetween: WhereBetweenMethod<QB>;
    andWhereNotBetween: WhereBetweenMethod<QB>;
    whereNull: WhereNullMethod<QB>;
    orWhereNull: WhereNullMethod<QB>;
    whereNotNull: WhereNullMethod<QB>;
    orWhereNotNull: WhereNullMethod<QB>;
    whereColumn: WhereColumnMethod<QB>;
    orWhereColumn: WhereColumnMethod<QB>;
    andWhereColumn: WhereColumnMethod<QB>;
    whereNotColumn: WhereColumnMethod<QB>;
    orWhereNotColumn: WhereColumnMethod<QB>;
    andWhereNotColumn: WhereColumnMethod<QB>;
    whereJsonObject: WhereJsonObject<QB>;
    orWhereJsonObject: WhereJsonObject<QB>;
    andWhereJsonObject: WhereJsonObject<QB>;
    whereNotJsonObject: WhereJsonObject<QB>;
    orWhereNotJsonObject: WhereJsonObject<QB>;
    andWhereNotJsonObject: WhereJsonObject<QB>;
    whereJsonPath: WhereJsonPath<QB>;
    orWhereJsonPath: WhereJsonPath<QB>;
    andWhereJsonPath: WhereJsonPath<QB>;
    whereJsonSupersetOf: WhereJsonMethod<QB>;
    andWhereJsonSupersetOf: WhereJsonMethod<QB>;
    orWhereJsonSupersetOf: WhereJsonMethod<QB>;
    whereJsonNotSupersetOf: WhereJsonMethod<QB>;
    andWhereJsonNotSupersetOf: WhereJsonMethod<QB>;
    orWhereJsonNotSupersetOf: WhereJsonMethod<QB>;
    whereJsonSubsetOf: WhereJsonMethod<QB>;
    andWhereJsonSubsetOf: WhereJsonMethod<QB>;
    orWhereJsonSubsetOf: WhereJsonMethod<QB>;
    whereJsonNotSubsetOf: WhereJsonMethod<QB>;
    andWhereJsonNotSubsetOf: WhereJsonMethod<QB>;
    orWhereJsonNotSubsetOf: WhereJsonMethod<QB>;
    whereJsonIsArray: WhereFieldExpressionMethod<QB>;
    orWhereJsonIsArray: WhereFieldExpressionMethod<QB>;
    whereJsonNotArray: WhereFieldExpressionMethod<QB>;
    orWhereJsonNotArray: WhereFieldExpressionMethod<QB>;
    whereJsonIsObject: WhereFieldExpressionMethod<QB>;
    orWhereJsonIsObject: WhereFieldExpressionMethod<QB>;
    whereJsonNotObject: WhereFieldExpressionMethod<QB>;
    orWhereJsonNotObject: WhereFieldExpressionMethod<QB>;
    whereJsonHasAny: WhereJsonExpressionMethod<QB>;
    orWhereJsonHasAny: WhereJsonExpressionMethod<QB>;
    whereJsonHasAll: WhereJsonExpressionMethod<QB>;
    orWhereJsonHasAll: WhereJsonExpressionMethod<QB>;
    having: WhereMethod<QB>;
    andHaving: WhereMethod<QB>;
    orHaving: WhereMethod<QB>;
    havingIn: WhereInMethod<QB>;
    orHavingIn: WhereInMethod<QB>;
    havingNotIn: WhereInMethod<QB>;
    orHavingNotIn: WhereInMethod<QB>;
    havingNull: WhereNullMethod<QB>;
    orHavingNull: WhereNullMethod<QB>;
    havingNotNull: WhereNullMethod<QB>;
    orHavingNotNull: WhereNullMethod<QB>;
    havingBetween: WhereBetweenMethod<QB>;
    orHavingBetween: WhereBetweenMethod<QB>;
    havingNotBetween: WhereBetweenMethod<QB>;
    orHavingNotBetween: WhereBetweenMethod<QB>;
    whereComposite: WhereCompositeMethod<QB>;
    whereInComposite: WhereInCompositeMethod<QB>;
    whereNotInComposite: WhereInCompositeMethod<QB>;
    with: WithMethod<QB>;
    withRecursive: WithMethod<QB>;
    withWrapped: WithMethod<QB>;
    withMaterialized: WithMethod<QB>;
    withNotMaterialized: WithMethod<QB>;
    joinRelated: JoinRelatedMethod<QB>;
    innerJoinRelated: JoinRelatedMethod<QB>;
    outerJoinRelated: JoinRelatedMethod<QB>;
    leftJoinRelated: JoinRelatedMethod<QB>;
    leftOuterJoinRelated: JoinRelatedMethod<QB>;
    rightJoinRelated: JoinRelatedMethod<QB>;
    rightOuterJoinRelated: JoinRelatedMethod<QB>;
    fullOuterJoinRelated: JoinRelatedMethod<QB>;
    join: JoinMethod<QB>;
    joinRaw: JoinRawMethod<QB>;
    innerJoin: JoinMethod<QB>;
    leftJoin: JoinMethod<QB>;
    leftOuterJoin: JoinMethod<QB>;
    rightJoin: JoinMethod<QB>;
    rightOuterJoin: JoinMethod<QB>;
    outerJoin: JoinMethod<QB>;
    fullOuterJoin: JoinMethod<QB>;
    crossJoin: JoinMethod<QB>;
    count: CountMethod<QB>;
    countDistinct: CountMethod<QB>;
    min: AggregateMethod<QB>;
    max: AggregateMethod<QB>;
    sum: AggregateMethod<QB>;
    sumDistinct: AggregateMethod<QB>;
    avg: AggregateMethod<QB>;
    avgDistinct: AggregateMethod<QB>;
    increment: IncrementDecrementMethod<QB>;
    decrement: IncrementDecrementMethod<QB>;
    orderBy: OrderByMethod<QB>;
    groupBy: GroupByMethod<QB>;
    findOne: WhereMethod<MaybeSingleQueryBuilder<QB>>;
    alias: OneArgMethod<string, QB>;
    aliasFor: AliasForMethod<QB>;
  }

  interface StrictScopedMethods<QB extends AnyQueryBuilder> {
    select: StrictSelectMethod<QB>;
    columns: StrictSelectMethod<QB>;
    column: StrictSelectMethod<QB>;
    distinct: StrictSelectMethod<QB>;
    distinctOn: StrictSelectMethod<QB>;
    from: FromMethod<OpenScope<QB>>;
    table: FromMethod<OpenScope<QB>>;
    into: FromMethod<OpenScope<QB>>;
    fromRaw: FromRawMethod<OpenScope<QB>>;
    where: StrictWhereMethod<QB>;
    andWhere: StrictWhereMethod<QB>;
    orWhere: StrictWhereMethod<QB>;
    whereNot: StrictWhereMethod<QB>;
    andWhereNot: StrictWhereMethod<QB>;
    orWhereNot: StrictWhereMethod<QB>;
    whereLike: StrictWhereLikeMethod<QB>;
    andWhereLike: StrictWhereLikeMethod<QB>;
    orWhereLike: StrictWhereLikeMethod<QB>;
    whereILike: StrictWhereLikeMethod<QB>;
    andWhereILike: StrictWhereLikeMethod<QB>;
    orWhereILike: StrictWhereLikeMethod<QB>;
    whereIn: StrictWhereInMethod<QB>;
    orWhereIn: StrictWhereInMethod<QB>;
    whereNotIn: StrictWhereInMethod<QB>;
    orWhereNotIn: StrictWhereInMethod<QB>;
    whereBetween: StrictWhereBetweenMethod<QB>;
    orWhereBetween: StrictWhereBetweenMethod<QB>;
    andWhereBetween: StrictWhereBetweenMethod<QB>;
    whereNotBetween: StrictWhereBetweenMethod<QB>;
    orWhereNotBetween: StrictWhereBetweenMethod<QB>;
    andWhereNotBetween: StrictWhereBetweenMethod<QB>;
    whereNull: StrictWhereNullMethod<QB>;
    orWhereNull: StrictWhereNullMethod<QB>;
    whereNotNull: StrictWhereNullMethod<QB>;
    orWhereNotNull: StrictWhereNullMethod<QB>;
    whereColumn: StrictWhereColumnMethod<QB>;
    orWhereColumn: StrictWhereColumnMethod<QB>;
    andWhereColumn: StrictWhereColumnMethod<QB>;
    whereNotColumn: StrictWhereColumnMethod<QB>;
    orWhereNotColumn: StrictWhereColumnMethod<QB>;
    andWhereNotColumn: StrictWhereColumnMethod<QB>;
    whereJsonObject: StrictWhereJsonObject<QB>;
    orWhereJsonObject: StrictWhereJsonObject<QB>;
    andWhereJsonObject: StrictWhereJsonObject<QB>;
    whereNotJsonObject: StrictWhereJsonObject<QB>;
    orWhereNotJsonObject: StrictWhereJsonObject<QB>;
    andWhereNotJsonObject: StrictWhereJsonObject<QB>;
    whereJsonPath: StrictWhereJsonPath<QB>;
    orWhereJsonPath: StrictWhereJsonPath<QB>;
    andWhereJsonPath: StrictWhereJsonPath<QB>;
    whereJsonSupersetOf: StrictWhereJsonMethod<QB>;
    andWhereJsonSupersetOf: StrictWhereJsonMethod<QB>;
    orWhereJsonSupersetOf: StrictWhereJsonMethod<QB>;
    whereJsonNotSupersetOf: StrictWhereJsonMethod<QB>;
    andWhereJsonNotSupersetOf: StrictWhereJsonMethod<QB>;
    orWhereJsonNotSupersetOf: StrictWhereJsonMethod<QB>;
    whereJsonSubsetOf: StrictWhereJsonMethod<QB>;
    andWhereJsonSubsetOf: StrictWhereJsonMethod<QB>;
    orWhereJsonSubsetOf: StrictWhereJsonMethod<QB>;
    whereJsonNotSubsetOf: StrictWhereJsonMethod<QB>;
    andWhereJsonNotSubsetOf: StrictWhereJsonMethod<QB>;
    orWhereJsonNotSubsetOf: StrictWhereJsonMethod<QB>;
    whereJsonIsArray: StrictWhereFieldExpressionMethod<QB>;
    orWhereJsonIsArray: StrictWhereFieldExpressionMethod<QB>;
    whereJsonNotArray: StrictWhereFieldExpressionMethod<QB>;
    orWhereJsonNotArray: StrictWhereFieldExpressionMethod<QB>;
    whereJsonIsObject: StrictWhereFieldExpressionMethod<QB>;
    orWhereJsonIsObject: StrictWhereFieldExpressionMethod<QB>;
    whereJsonNotObject: StrictWhereFieldExpressionMethod<QB>;
    orWhereJsonNotObject: StrictWhereFieldExpressionMethod<QB>;
    whereJsonHasAny: StrictWhereJsonExpressionMethod<QB>;
    orWhereJsonHasAny: StrictWhereJsonExpressionMethod<QB>;
    whereJsonHasAll: StrictWhereJsonExpressionMethod<QB>;
    orWhereJsonHasAll: StrictWhereJsonExpressionMethod<QB>;
    having: StrictWhereMethod<QB, 'output'>;
    andHaving: StrictWhereMethod<QB, 'output'>;
    orHaving: StrictWhereMethod<QB, 'output'>;
    havingIn: StrictWhereInMethod<QB, 'output'>;
    orHavingIn: StrictWhereInMethod<QB, 'output'>;
    havingNotIn: StrictWhereInMethod<QB, 'output'>;
    orHavingNotIn: StrictWhereInMethod<QB, 'output'>;
    havingNull: StrictWhereNullMethod<QB, 'output'>;
    orHavingNull: StrictWhereNullMethod<QB, 'output'>;
    havingNotNull: StrictWhereNullMethod<QB, 'output'>;
    orHavingNotNull: StrictWhereNullMethod<QB, 'output'>;
    havingBetween: StrictWhereBetweenMethod<QB, 'output'>;
    orHavingBetween: StrictWhereBetweenMethod<QB, 'output'>;
    havingNotBetween: StrictWhereBetweenMethod<QB, 'output'>;
    orHavingNotBetween: StrictWhereBetweenMethod<QB, 'output'>;
    whereComposite: StrictWhereCompositeMethod<QB>;
    whereInComposite: StrictWhereInCompositeMethod<QB>;
    whereNotInComposite: StrictWhereInCompositeMethod<QB>;
    with: WithMethod<OpenScope<QB>>;
    withRecursive: WithMethod<OpenScope<QB>>;
    withWrapped: WithMethod<OpenScope<QB>>;
    withMaterialized: WithMethod<OpenScope<QB>>;
    withNotMaterialized: WithMethod<OpenScope<QB>>;
    joinRelated: StrictJoinRelatedMethod<QB>;
    innerJoinRelated: StrictJoinRelatedMethod<QB>;
    outerJoinRelated: StrictJoinRelatedMethod<QB>;
    leftJoinRelated: StrictJoinRelatedMethod<QB>;
    leftOuterJoinRelated: StrictJoinRelatedMethod<QB>;
    rightJoinRelated: StrictJoinRelatedMethod<QB>;
    rightOuterJoinRelated: StrictJoinRelatedMethod<QB>;
    fullOuterJoinRelated: StrictJoinRelatedMethod<QB>;
    join: JoinMethod<OpenScope<QB>>;
    joinRaw: JoinRawMethod<OpenScope<QB>>;
    innerJoin: JoinMethod<OpenScope<QB>>;
    leftJoin: JoinMethod<OpenScope<QB>>;
    leftOuterJoin: JoinMethod<OpenScope<QB>>;
    rightJoin: JoinMethod<OpenScope<QB>>;
    rightOuterJoin: JoinMethod<OpenScope<QB>>;
    outerJoin: JoinMethod<OpenScope<QB>>;
    fullOuterJoin: JoinMethod<OpenScope<QB>>;
    crossJoin: JoinMethod<OpenScope<QB>>;
    count: StrictCountMethod<QB>;
    countDistinct: StrictCountMethod<QB>;
    min: StrictAggregateMethod<QB>;
    max: StrictAggregateMethod<QB>;
    sum: StrictAggregateMethod<QB>;
    sumDistinct: StrictAggregateMethod<QB>;
    avg: StrictAggregateMethod<QB>;
    avgDistinct: StrictAggregateMethod<QB>;
    increment: StrictIncrementDecrementMethod<QB>;
    decrement: StrictIncrementDecrementMethod<QB>;
    orderBy: StrictOrderByMethod<QB>;
    groupBy: StrictGroupByMethod<QB>;
    findOne: StrictWhereMethod<MaybeSingleQueryBuilder<QB>>;
    alias: StrictAliasMethod<QB>;
    aliasFor: AliasForMethod<OpenScope<QB>>;
  }

  type ScopedMethods<QB extends AnyQueryBuilder> = IfStrict<
    LooseScopedMethods<QB>,
    StrictScopedMethods<QB>
  >;

  export class QueryBuilder<M extends Model, R = M[]> implements CatchablePromiseLike<R> {
    static forClass: ForClassMethod;

    constructor(modelClass: ModelConstructor<M>);

    select: ScopedMethods<this>['select'];
    columns: ScopedMethods<this>['columns'];
    column: ScopedMethods<this>['column'];
    distinct: ScopedMethods<this>['distinct'];
    distinctOn: ScopedMethods<this>['distinctOn'];
    as: AsMethod<this>;

    from: ScopedMethods<this>['from'];
    table: ScopedMethods<this>['table'];
    into: ScopedMethods<this>['into'];
    fromRaw: ScopedMethods<this>['fromRaw'];

    jsonExtract: JsonExtract<this>;
    jsonSet: JsonSet<this>;
    jsonInsert: JsonInsert<this>;
    jsonRemove: JsonRemove<this>;

    where: ScopedMethods<this>['where'];
    andWhere: ScopedMethods<this>['andWhere'];
    orWhere: ScopedMethods<this>['orWhere'];
    whereNot: ScopedMethods<this>['whereNot'];
    andWhereNot: ScopedMethods<this>['andWhereNot'];
    orWhereNot: ScopedMethods<this>['orWhereNot'];
    whereLike: ScopedMethods<this>['whereLike'];
    andWhereLike: ScopedMethods<this>['andWhereLike'];
    orWhereLike: ScopedMethods<this>['orWhereLike'];
    whereILike: ScopedMethods<this>['whereILike'];
    andWhereILike: ScopedMethods<this>['andWhereILike'];
    orWhereILike: ScopedMethods<this>['orWhereILike'];

    whereRaw: WhereRawMethod<this>;
    orWhereRaw: WhereRawMethod<this>;
    andWhereRaw: WhereRawMethod<this>;

    whereWrapped: WhereWrappedMethod<this>;
    havingWrapped: WhereWrappedMethod<this>;

    whereExists: WhereExistsMethod<this>;
    orWhereExists: WhereExistsMethod<this>;
    whereNotExists: WhereExistsMethod<this>;
    orWhereNotExists: WhereExistsMethod<this>;

    whereIn: ScopedMethods<this>['whereIn'];
    orWhereIn: ScopedMethods<this>['orWhereIn'];
    whereNotIn: ScopedMethods<this>['whereNotIn'];
    orWhereNotIn: ScopedMethods<this>['orWhereNotIn'];

    whereBetween: ScopedMethods<this>['whereBetween'];
    orWhereBetween: ScopedMethods<this>['orWhereBetween'];
    andWhereBetween: ScopedMethods<this>['andWhereBetween'];
    whereNotBetween: ScopedMethods<this>['whereNotBetween'];
    orWhereNotBetween: ScopedMethods<this>['orWhereNotBetween'];
    andWhereNotBetween: ScopedMethods<this>['andWhereNotBetween'];

    whereNull: ScopedMethods<this>['whereNull'];
    orWhereNull: ScopedMethods<this>['orWhereNull'];
    whereNotNull: ScopedMethods<this>['whereNotNull'];
    orWhereNotNull: ScopedMethods<this>['orWhereNotNull'];

    whereColumn: ScopedMethods<this>['whereColumn'];
    orWhereColumn: ScopedMethods<this>['orWhereColumn'];
    andWhereColumn: ScopedMethods<this>['andWhereColumn'];
    whereNotColumn: ScopedMethods<this>['whereNotColumn'];
    orWhereNotColumn: ScopedMethods<this>['orWhereNotColumn'];
    andWhereNotColumn: ScopedMethods<this>['andWhereNotColumn'];

    whereJsonObject: ScopedMethods<this>['whereJsonObject'];
    orWhereJsonObject: ScopedMethods<this>['orWhereJsonObject'];
    andWhereJsonObject: ScopedMethods<this>['andWhereJsonObject'];
    whereNotJsonObject: ScopedMethods<this>['whereNotJsonObject'];
    orWhereNotJsonObject: ScopedMethods<this>['orWhereNotJsonObject'];
    andWhereNotJsonObject: ScopedMethods<this>['andWhereNotJsonObject'];

    whereJsonPath: ScopedMethods<this>['whereJsonPath'];
    orWhereJsonPath: ScopedMethods<this>['orWhereJsonPath'];
    andWhereJsonPath: ScopedMethods<this>['andWhereJsonPath'];

    whereJsonSupersetOf: ScopedMethods<this>['whereJsonSupersetOf'];
    andWhereJsonSupersetOf: ScopedMethods<this>['andWhereJsonSupersetOf'];
    orWhereJsonSupersetOf: ScopedMethods<this>['orWhereJsonSupersetOf'];
    whereJsonNotSupersetOf: ScopedMethods<this>['whereJsonNotSupersetOf'];
    andWhereJsonNotSupersetOf: ScopedMethods<this>['andWhereJsonNotSupersetOf'];
    orWhereJsonNotSupersetOf: ScopedMethods<this>['orWhereJsonNotSupersetOf'];
    whereJsonSubsetOf: ScopedMethods<this>['whereJsonSubsetOf'];
    andWhereJsonSubsetOf: ScopedMethods<this>['andWhereJsonSubsetOf'];
    orWhereJsonSubsetOf: ScopedMethods<this>['orWhereJsonSubsetOf'];
    whereJsonNotSubsetOf: ScopedMethods<this>['whereJsonNotSubsetOf'];
    andWhereJsonNotSubsetOf: ScopedMethods<this>['andWhereJsonNotSubsetOf'];
    orWhereJsonNotSubsetOf: ScopedMethods<this>['orWhereJsonNotSubsetOf'];
    whereJsonIsArray: ScopedMethods<this>['whereJsonIsArray'];
    orWhereJsonIsArray: ScopedMethods<this>['orWhereJsonIsArray'];
    whereJsonNotArray: ScopedMethods<this>['whereJsonNotArray'];
    orWhereJsonNotArray: ScopedMethods<this>['orWhereJsonNotArray'];
    whereJsonIsObject: ScopedMethods<this>['whereJsonIsObject'];
    orWhereJsonIsObject: ScopedMethods<this>['orWhereJsonIsObject'];
    whereJsonNotObject: ScopedMethods<this>['whereJsonNotObject'];
    orWhereJsonNotObject: ScopedMethods<this>['orWhereJsonNotObject'];
    whereJsonHasAny: ScopedMethods<this>['whereJsonHasAny'];
    orWhereJsonHasAny: ScopedMethods<this>['orWhereJsonHasAny'];
    whereJsonHasAll: ScopedMethods<this>['whereJsonHasAll'];
    orWhereJsonHasAll: ScopedMethods<this>['orWhereJsonHasAll'];

    having: ScopedMethods<this>['having'];
    andHaving: ScopedMethods<this>['andHaving'];
    orHaving: ScopedMethods<this>['orHaving'];

    havingRaw: WhereRawMethod<this>;
    orHavingRaw: WhereRawMethod<this>;

    havingIn: ScopedMethods<this>['havingIn'];
    orHavingIn: ScopedMethods<this>['orHavingIn'];
    havingNotIn: ScopedMethods<this>['havingNotIn'];
    orHavingNotIn: ScopedMethods<this>['orHavingNotIn'];

    havingNull: ScopedMethods<this>['havingNull'];
    orHavingNull: ScopedMethods<this>['orHavingNull'];
    havingNotNull: ScopedMethods<this>['havingNotNull'];
    orHavingNotNull: ScopedMethods<this>['orHavingNotNull'];

    havingExists: WhereExistsMethod<this>;
    orHavingExists: WhereExistsMethod<this>;
    havingNotExists: WhereExistsMethod<this>;
    orHavingNotExists: WhereExistsMethod<this>;

    havingBetween: ScopedMethods<this>['havingBetween'];
    orHavingBetween: ScopedMethods<this>['orHavingBetween'];
    havingNotBetween: ScopedMethods<this>['havingNotBetween'];
    orHavingNotBetween: ScopedMethods<this>['orHavingNotBetween'];

    whereComposite: ScopedMethods<this>['whereComposite'];
    whereInComposite: ScopedMethods<this>['whereInComposite'];
    whereNotInComposite: ScopedMethods<this>['whereNotInComposite'];

    union: UnionMethod<this>;
    unionAll: UnionMethod<this>;
    intersect: SetOperationsMethod<this>;
    except: SetOperationsMethod<this>;

    with: ScopedMethods<this>['with'];
    withRecursive: ScopedMethods<this>['withRecursive'];
    withWrapped: ScopedMethods<this>['withWrapped'];
    withMaterialized: ScopedMethods<this>['withMaterialized'];
    withNotMaterialized: ScopedMethods<this>['withNotMaterialized'];

    joinRelated: ScopedMethods<this>['joinRelated'];
    innerJoinRelated: ScopedMethods<this>['innerJoinRelated'];
    outerJoinRelated: ScopedMethods<this>['outerJoinRelated'];
    leftJoinRelated: ScopedMethods<this>['leftJoinRelated'];
    leftOuterJoinRelated: ScopedMethods<this>['leftOuterJoinRelated'];
    rightJoinRelated: ScopedMethods<this>['rightJoinRelated'];
    rightOuterJoinRelated: ScopedMethods<this>['rightOuterJoinRelated'];
    fullOuterJoinRelated: ScopedMethods<this>['fullOuterJoinRelated'];

    join: ScopedMethods<this>['join'];
    joinRaw: ScopedMethods<this>['joinRaw'];
    innerJoin: ScopedMethods<this>['innerJoin'];
    leftJoin: ScopedMethods<this>['leftJoin'];
    leftOuterJoin: ScopedMethods<this>['leftOuterJoin'];
    rightJoin: ScopedMethods<this>['rightJoin'];
    rightOuterJoin: ScopedMethods<this>['rightOuterJoin'];
    outerJoin: ScopedMethods<this>['outerJoin'];
    fullOuterJoin: ScopedMethods<this>['fullOuterJoin'];
    crossJoin: ScopedMethods<this>['crossJoin'];

    count: ScopedMethods<this>['count'];
    countDistinct: ScopedMethods<this>['countDistinct'];
    min: ScopedMethods<this>['min'];
    max: ScopedMethods<this>['max'];
    sum: ScopedMethods<this>['sum'];
    sumDistinct: ScopedMethods<this>['sumDistinct'];
    avg: ScopedMethods<this>['avg'];
    avgDistinct: ScopedMethods<this>['avgDistinct'];
    increment: ScopedMethods<this>['increment'];
    decrement: ScopedMethods<this>['decrement'];
    first: FirstMethod;
    none: IdentityMethod<this>;

    orderBy: ScopedMethods<this>['orderBy'];
    orderByRaw: OrderByRawMethod<this>;

    groupBy: ScopedMethods<this>['groupBy'];
    groupByRaw: RawInterface<this>;

    findById(id: MaybeCompositeId): MaybeSingleQueryBuilder<this>;
    findByIds(ids: MaybeCompositeId[]): this;
    findOne: ScopedMethods<this>['findOne'];

    execute(): Promise<R>;
    castTo<MC extends Model>(modelClass: ModelConstructor<MC>): QueryBuilderType<MC>;
    castTo<R>(): QueryBuilder<M, R>;

    update(update: PartialModelObject<M>): NumberQueryBuilder<this>;
    update(): NumberQueryBuilder<this>;
    updateById(id: MaybeCompositeId, update: PartialModelObject<M>): NumberQueryBuilder<this>;
    updateAndFetch(update: PartialModelObject<M>): SingleQueryBuilder<this>;
    updateAndFetchById(
      id: MaybeCompositeId,
      update: PartialModelObject<M>,
    ): SingleQueryBuilder<this>;

    patch(update: PartialModelObject<M>): NumberQueryBuilder<this>;
    patch(): NumberQueryBuilder<this>;
    patchById(id: MaybeCompositeId, update: PartialModelObject<M>): NumberQueryBuilder<this>;
    patchAndFetch(update: PartialModelObject<M>): SingleQueryBuilder<this>;
    patchAndFetchById(
      id: MaybeCompositeId,
      update: PartialModelObject<M>,
    ): SingleQueryBuilder<this>;

    del(): NumberQueryBuilder<this>;
    delete(): NumberQueryBuilder<this>;
    deleteById(id: MaybeCompositeId): NumberQueryBuilder<this>;

    insert(insert: PartialModelObject<M>): SingleQueryBuilder<this>;
    insert(insert: PartialModelObject<M>[]): ArrayQueryBuilder<this>;
    insert(): SingleQueryBuilder<this>;

    onConflict(column?: ColumnRef | ColumnRef[] | true): this;
    ignore(): this;
    merge(merge?: PartialModelObject<M> | string[]): this;

    insertAndFetch(insert: PartialModelObject<M>): SingleQueryBuilder<this>;
    insertAndFetch(insert: PartialModelObject<M>[]): ArrayQueryBuilder<this>;
    insertAndFetch(): SingleQueryBuilder<this>;

    relate(
      ids: MaybeCompositeId | MaybeCompositeId[] | PartialModelObject<M> | PartialModelObject<M>[],
    ): NumberQueryBuilder<this>;

    unrelate(): NumberQueryBuilder<this>;
    for(ids: ForIdValue | ForIdValue[]): this;

    // With literal relation expressions, the fetched relations become required
    // on the result type, see WithGraphQueryBuilder. In strict mode, the
    // column scope is kept, and `withGraphJoined()` adds the joined relations
    // to it, see StrictWithGraphJoined.
    withGraphFetched<const E extends RelationExpression<M>>(
      expr: IfStrict<E, E & CheckRelationExpression<this, E>>,
      options?: GraphOptions,
    ): IfStrict<WithGraphQueryBuilder<this, E>, CarryScope<this, WithGraphQueryBuilder<this, E>>>;
    withGraphJoined<const E extends RelationExpression<M>, const O extends GraphOptions = {}>(
      expr: IfStrict<E, E & CheckRelationExpression<this, E>>,
      options?: O,
    ): IfStrict<WithGraphQueryBuilder<this, E>, StrictWithGraphJoined<this, E, O>>;
    withGraph<const E extends RelationExpression<M>>(
      expr: IfStrict<E, E & CheckRelationExpression<this, E>>,
      options?: WithGraphOptions,
    ): IfStrict<WithGraphQueryBuilder<this, E>, CarryScope<this, WithGraphQueryBuilder<this, E>>>;

    truncate(): Promise<void>;
    allowGraph: AllowGraphMethod<this>;

    throwIfNotFound: (arg?: any) => R extends Model | undefined ? SingleQueryBuilder<this> : this;

    returning: ReturningMethod;
    forUpdate: IdentityMethod<this>;
    forShare: IdentityMethod<this>;
    forNoKeyUpdate: IdentityMethod<this>;
    forKeyShare: IdentityMethod<this>;
    skipLocked: IdentityMethod<this>;
    noWait: IdentityMethod<this>;
    skipUndefined: IdentityMethod<this>;
    debug: IdentityMethod<this>;
    alias: ScopedMethods<this>['alias'];
    aliasFor: ScopedMethods<this>['aliasFor'];
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

    context: ContextMethod<this>;
    clearContext: ClearContextMethod<this>;

    modify: ModifyMethod<this>;
    modifiers: ModifiersMethod<this>;

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

    clearSelect: IdentityMethod<this>;
    clearOrder: IdentityMethod<this>;
    clearWhere: IdentityMethod<this>;
    clearWithGraph: IdentityMethod<this>;
    clearAllowGraph: IdentityMethod<this>;

    ModelType: M;
    ResultType: R;

    ArrayQueryBuilderType: QueryBuilder<M, M[]>;
    SingleQueryBuilderType: QueryBuilder<M, M>;
    MaybeSingleQueryBuilderType: QueryBuilder<M, M | undefined>;
    NumberQueryBuilderType: QueryBuilder<M, number>;
    PageQueryBuilderType: QueryBuilder<M, Page<M>>;

    then<R1 = R, R2 = never>(
      onfulfilled?: ((value: R) => R1 | PromiseLike<R1>) | undefined | null,
      onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | undefined | null,
    ): Promise<R1 | R2>;

    catch<FR = never>(
      onrejected?: ((reason: any) => FR | PromiseLike<FR>) | undefined | null,
    ): Promise<R | FR>;
  }

  type X<T> = Promise<T>;

  interface FetchGraphOptions {
    transaction?: TransactionOrKnex;
    skipFetched?: boolean;
  }

  interface TraverserFunction {
    (model: Model, parentModel: Model, relationName: string): void;
  }

  type ArrayQueryBuilderThunk<M extends Model> = () => ArrayQueryBuilder<QueryBuilderType<M>>;
  type CancelQueryThunk = (result: any) => void;

  export interface StaticHookArguments<M extends Model, R = any> {
    asFindQuery: ArrayQueryBuilderThunk<M>;
    cancelQuery: CancelQueryThunk;
    context: QueryContext;
    transaction: TransactionOrKnex;
    relation?: Relation;
    modelOptions?: ModelOptions;
    items: Model[];
    inputItems: M[];
    result?: R;
  }

  export type Transaction = Knex.Transaction;
  export type TransactionOrKnex = Transaction | Knex;

  export interface RelationMappings {
    [relationName: string]: RelationMapping<any>;
  }

  export type RelationMappingsThunk = () => RelationMappings;

  type ModelClassFactory = () => AnyModelConstructor;
  type ModelClassSpecifier = ModelClassFactory | AnyModelConstructor | string;
  type RelationMappingHook<M extends Model> = (
    model: M,
    context: QueryContext,
  ) => Promise<void> | void;
  type StringOrReferenceBuilder = string | ReferenceBuilder;
  type RelationMappingColumnRef = StringOrReferenceBuilder | StringOrReferenceBuilder[];

  export interface RelationMapping<M extends Model> {
    relation: RelationType;
    modelClass: ModelClassSpecifier;
    join: RelationJoin;
    modify?: Modifier<QueryBuilderType<M>>;
    filter?: Modifier<QueryBuilderType<M>>;
    beforeInsert?: RelationMappingHook<M>;
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

  export interface SnakeCaseMappersOptions {
    upperCase?: boolean;
    underscoreBeforeDigits?: boolean;
    underscoreBetweenUppercaseLetters?: boolean;
    noDoubleUnderscores?: boolean;
    /**
     * Only convert the column part of field expressions like
     * `jsonColumn:someKey` and keep their JSON keys as written.
     * Only used by `snakeCaseMappers`.
     */
    preserveJsonKeys?: boolean;
  }

  export interface ColumnNameMappers {
    parse(json: Pojo): Pojo;
    format(json: Pojo): Pojo;
  }

  export interface SnakeCaseMappersFactory {
    (options?: SnakeCaseMappersOptions): ColumnNameMappers;
  }

  export interface KnexMappers {
    wrapIdentifier(identifier: string, origWrap: Identity<string>): string;
    postProcessResponse(response: any): any;
  }

  export interface KnexSnakeCaseMappersFactory {
    (options?: SnakeCaseMappersOptions): KnexMappers;
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

  interface PrototypeType<T> extends Function {
    prototype: T;
  }

  interface ConstructorFunctionType<T = any> extends PrototypeType<T> {
    new (...args: any[]): T;
  }

  // for internal use on generic static this deduction, copied from https://github.com/microsoft/TypeScript/issues/5863#issuecomment-1483978415
  type ConstructorType<T = unknown, Static extends Record<string, any> = PrototypeType<T>> = (
    ConstructorFunctionType<T> | PrototypeType<T>
  ) & {
    [Key in keyof Static]: Static[Key];
  };

  export interface ModelConstructor<M extends Model> extends Constructor<M> {}

  export interface ModelClass<M extends Model> extends ModelConstructor<M> {
    QueryBuilder: typeof QueryBuilder;

    tableName: string;
    idColumn: null | string | string[] | readonly string[];
    jsonSchema: ModelJSONSchema;
    relationMappings: RelationMappings | RelationMappingsThunk;
    modelPaths: string[];
    jsonAttributes: string[] | readonly string[];
    virtualAttributes: string[];
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
    modifiers: Modifiers;
    columnNameMappers: ColumnNameMappers;

    raw: RawFunction;
    ref: ReferenceFunction;
    fn: FunctionFunction;

    BelongsToOneRelation: RelationType;
    HasOneRelation: RelationType;
    HasManyRelation: RelationType;
    ManyToManyRelation: RelationType;
    HasOneThroughRelation: RelationType;

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
    fromDatabaseJson(json: object): M;

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
    ): SingleQueryBuilder<WithGraphModelQueryBuilder<M, E>>;

    fetchGraph<const E extends RelationExpression<M>>(
      modelOrObject: PartialModelObject<M>[],
      expression: E,
      options?: FetchGraphOptions,
    ): WithGraphModelQueryBuilder<M, E>;

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
    afterFind(args: StaticHookArguments<any>): any;
    beforeInsert(args: StaticHookArguments<any>): any;
    afterInsert(args: StaticHookArguments<any>): any;
    beforeUpdate(args: StaticHookArguments<any>): any;
    afterUpdate(args: StaticHookArguments<any>): any;
    beforeDelete(args: StaticHookArguments<any>): any;
    afterDelete(args: StaticHookArguments<any>): any;
  }

  export class Model {
    static QueryBuilder: typeof QueryBuilder;

    static tableName: string;
    static idColumn: null | string | string[] | readonly string[];
    static jsonSchema: ModelJSONSchema;
    static relationMappings: RelationMappings | RelationMappingsThunk;
    static modelPaths: string[];
    static jsonAttributes: string[] | readonly string[];
    static virtualAttributes: string[];
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
    static modifiers: Modifiers;
    static columnNameMappers: ColumnNameMappers;

    static raw: RawFunction;
    static ref: ReferenceFunction;
    static fn: FunctionFunction;

    static BelongsToOneRelation: RelationType;
    static HasOneRelation: RelationType;
    static HasManyRelation: RelationType;
    static ManyToManyRelation: RelationType;
    static HasOneThroughRelation: RelationType;

    static defaultGraphOptions?: GraphOptions;

    // T captures a literal `static tableName` for strict mode, see
    // RootQueryBuilder.
    static query<M extends Model, T extends string = string>(
      this: ConstructorType<M> & { tableName?: T },
      trxOrKnex?: TransactionOrKnex,
    ): IfStrict<QueryBuilderType<M>, RootQueryBuilder<QueryBuilderType<M>, T>>;

    static relatedQuery<M extends Model, K extends keyof M>(
      this: ConstructorType<M>,
      relationName: K,
      trxOrKnex?: TransactionOrKnex,
    ): ArrayRelatedQueryBuilder<M[K]>;

    static relatedQuery<RM extends Model>(
      relationName: string,
      trxOrKnex?: TransactionOrKnex,
    ): QueryBuilderType<RM>;

    static fromJson<M extends Model>(this: ConstructorType<M>, json: object, opt?: ModelOptions): M;
    static fromDatabaseJson<M extends Model>(this: ConstructorType<M>, json: object): M;

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

    static fetchGraph<M extends Model, const E extends RelationExpression<M>>(
      this: ConstructorType<M>,
      modelOrObject: PartialModelObject<M>,
      expression: E,
      options?: FetchGraphOptions,
    ): SingleQueryBuilder<WithGraphModelQueryBuilder<M, E>>;

    static fetchGraph<M extends Model, const E extends RelationExpression<M>>(
      this: ConstructorType<M>,
      modelOrObject: PartialModelObject<M>[],
      expression: E,
      options?: FetchGraphOptions,
    ): WithGraphModelQueryBuilder<M, E>;

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
    static afterFind(args: StaticHookArguments<any>): any;
    static beforeInsert(args: StaticHookArguments<any>): any;
    static afterInsert(args: StaticHookArguments<any>): any;
    static beforeUpdate(args: StaticHookArguments<any>): any;
    static afterUpdate(args: StaticHookArguments<any>): any;
    static beforeDelete(args: StaticHookArguments<any>): any;
    static afterDelete(args: StaticHookArguments<any>): any;

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
    ): SingleQueryBuilder<WithGraphModelQueryBuilder<this, E>>;

    $formatDatabaseJson(json: Pojo): Pojo;
    $parseDatabaseJson(json: Pojo): Pojo;

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
    $toJson(opt?: ToJsonOptions): ModelObject<this>;
    toJSON(opt?: ToJsonOptions): ModelObject<this>;

    $setJson(json: object, opt?: ModelOptions): this;
    $setDatabaseJson(json: object): this;

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

  interface initialize {
    (knex: Knex, modelClasses: AnyModelConstructor[]): Promise<void>;
    (modelClasses: AnyModelConstructor[]): Promise<void>;
  }

  /**
   * Derives the type of the values described by a JSON schema declared with
   * `as const`, e.g. the properties of a model from its `jsonSchema`:
   *
   * ```ts
   * class Person extends Model {
   *   static jsonSchema = {
   *     type: 'object',
   *     required: ['firstName'],
   *     properties: {
   *       id: { type: 'integer' },
   *       firstName: { type: 'string' },
   *       age: { type: ['integer', 'null'] },
   *     },
   *   } as const;
   *
   *   pets?: Animal[];
   * }
   *
   * interface Person extends FromSchema<typeof Person.jsonSchema> {}
   * ```
   *
   * Supports `type` (also as an array), `required`, `nullable`, `enum`,
   * `const`, `items` (also as a tuple), nested `properties`, `anyOf` and
   * `oneOf`. Formats like 'date-time' stay strings, as in JSON. Properties
   * that aren't required become optional.
   */
  export type FromSchema<S> = SchemaType<S>;

  /**
   * The type of `static jsonSchema`. In strict mode, schemas declared with
   * `as const` are accepted too, for FromSchema. In loose mode, declare the
   * schema separately and assign it with `as unknown as JSONSchema` instead.
   */
  type ModelJSONSchema = IfStrict<JSONSchema, JSONSchema | ReadonlyJSONSchema>;

  type ReadonlyJSONSchema = ReadonlyDeep<JSONSchema>;

  type ReadonlyDeep<T> = T extends (infer I)[]
    ? readonly ReadonlyDeep<I>[]
    : T extends object
      ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
      : T;

  type SchemaType<S> = S extends boolean
    ? unknown
    : S extends { const: infer C }
      ? C
      : S extends { enum: readonly (infer E)[] }
        ? E | SchemaNullable<S>
        : S extends { anyOf: readonly (infer A)[] }
          ? SchemaType<A> | SchemaNullable<S>
          : S extends { oneOf: readonly (infer A)[] }
            ? SchemaType<A> | SchemaNullable<S>
            : S extends { type: infer T }
              ? | (T extends readonly (infer N)[] ? SchemaTypeName<N, S> : SchemaTypeName<T, S>)
                | SchemaNullable<S>
              : S extends { properties: object }
                ? SchemaObject<S>
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
      ? { -readonly [K in keyof I]: SchemaType<I[K]> }
      : SchemaType<I>[]
    : unknown[];

  type SchemaObject<S> = S extends { properties: infer P }
    ? SchemaProperties<P, S extends { required: readonly (infer R)[] } ? R : never>
    : { [key: string]: unknown };

  type SchemaProperties<P, R> = {
    -readonly [K in keyof P as K extends R ? K : never]: SchemaType<P[K]>;
  } & {
    -readonly [K in keyof P as K extends R ? never : K]?: SchemaType<P[K]>;
  } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;

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
}
