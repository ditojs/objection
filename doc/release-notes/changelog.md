# Changelog

## 3.3.0

### Security

- Escape keys in JSON field expressions. A `'` in a key used in `ref()`, a patch or update with field expression keys, or the `whereJson*` methods broke out of the SQL string literal, allowing SQL injection when keys come from user input. [#2077](https://github.com/Vincit/objection.js/issues/2077)

### What's new

- `withGraphFetched()` / `withGraphJoined()` narrow the result types: fetched relations become required on the result. Generic helpers with an explicit `QB` return type need `withGraphFetched<string>()`. [ditojs#25](https://github.com/ditojs/objection/pull/25)
- Add `withGraph()` with algorithm-agnostic merging, and `isJoinChildQuery()` [ditojs#63](https://github.com/ditojs/objection/issues/63)
- Add `patchById()` and `updateById()` [#1415](https://github.com/Vincit/objection.js/issues/1415)
- `insertGraph()` / `upsertGraph()` resolve cyclic `#ref` dependencies by deferring `BelongsToOne` foreign keys [#1482](https://github.com/Vincit/objection.js/issues/1482)
- Add a `preserveJsonKeys` option to `snakeCaseMappers()` to map only the column part of field expressions [#1089](https://github.com/Vincit/objection.js/issues/1089)
- Support empty keys in JSON field expressions, e.g. `col:[""]` [#2680](https://github.com/Vincit/objection.js/pull/2680)
- `whereJson*` methods accept `ref()`, `val()`, `raw()` and subqueries on the right side
- Pass `returning()` options, e.g. `includeTriggerModifications`, on to knex [#2309](https://github.com/Vincit/objection.js/issues/2309)

### Fixes

- Group the user's where clauses when adding a relation's owner condition. `$relatedQuery(...).where(a).orWhere(b).delete()` / `patch()` affected **other owners' rows**, and finds returned them. [#2191](https://github.com/Vincit/objection.js/issues/2191), [#1909](https://github.com/Vincit/objection.js/issues/1909)
- `findByIds([])` / `whereInComposite()` with an empty array and composite ids produced invalid SQL, and **matched every row on SQLite** [#1914](https://github.com/Vincit/objection.js/issues/1914)
- `onConflict().ignore()`: inserted rows were assigned to the wrong models, `$setDatabaseJson` could crash, and `insertAndFetch()` fetched undefined ids [#2320](https://github.com/Vincit/objection.js/issues/2320), [#2597](https://github.com/Vincit/objection.js/issues/2597), [#2661](https://github.com/Vincit/objection.js/issues/2661)
- `asFindQuery()` in many-to-many update and delete hooks lost its filters [#2266](https://github.com/Vincit/objection.js/issues/2266)
- Patch validation: `not` schemas stay intact [#1681](https://github.com/Vincit/objection.js/issues/1681), and nested `required` is stripped for nullable and untyped objects [#1664](https://github.com/Vincit/objection.js/issues/1664)
- `resultSize()` and `page()` count root models with `withGraphJoined()` [#2329](https://github.com/Vincit/objection.js/issues/2329), [#2143](https://github.com/Vincit/objection.js/issues/2143)
- Keep aliased subquery and raw selections in `withGraphJoined()` modifiers [#2365](https://github.com/Vincit/objection.js/issues/2365)
- Map column names in `whereJson*` methods with `knexSnakeCaseMappers`
- Match `table.*` selections through knex identifier mapping [#2288](https://github.com/Vincit/objection.js/issues/2288)
- Use the keys of modified `graphExpressionObject()` results [#2793](https://github.com/Vincit/objection.js/issues/2793)
- Track internally selected columns on the query builder, so `runAfter()` hooks never see them [ditojs#45](https://github.com/ditojs/objection/issues/45)
- **Behaviour change:** many-to-many `unrelate()` / `patch()` only modify the join rows matching the filters, not all join rows of the matching related rows [#1853](https://github.com/Vincit/objection.js/issues/1853). The generated SQL of these operations changes. On MySQL, the join table filter avoids `ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG` [#2127](https://github.com/Vincit/objection.js/issues/2127), and `unrelate()` returns `0` instead of `[]` when nothing matches. Ported from [#2406](https://github.com/Vincit/objection.js/pull/2406).
- **Behaviour change:** `asFindQuery()` in hooks no longer applies the `runAfter()` callbacks of the original query, including those of `throwIfNotFound()` and `traverse()`, and returns `[]` instead of `[undefined]` for a `findById()` that finds nothing [#2093](https://github.com/Vincit/objection.js/issues/2093)
- **Behaviour change:** field expression keys in patch objects, e.g. `'meta:a.b'`, are validated against the nested schema, so patches that passed before can fail validation [#1666](https://github.com/Vincit/objection.js/issues/1666)
- **Behaviour change:** the `joinOperation` option of `withGraphJoined()` applies per call, no longer to all relations of the query [#2125](https://github.com/Vincit/objection.js/issues/2125)
- **Behaviour change:** `withGraphJoined()` throws when it can't identify rows, e.g. for a model without a primary key, instead of silently merging them [#2748](https://github.com/Vincit/objection.js/issues/2748), [#2737](https://github.com/Vincit/objection.js/issues/2737)
- `insertGraph()` / `upsertGraph()` warn when `onConflict()`, `ignore()` or `merge()` is used. The clause is ignored, and will throw in 4.0. [#2156](https://github.com/Vincit/objection.js/issues/2156)

### Types

- Export the db-errors classes as types [#2499](https://github.com/Vincit/objection.js/issues/2499)

### Docs

- The docs moved to VitePress and are hosted at [ditojs.github.io/objection](https://ditojs.github.io/objection/)
- Document `relatedFindQueryMutates` / `relatedInsertQueryMutates` [#2356](https://github.com/Vincit/objection.js/issues/2356)
- Document running code after a transaction commits [#2582](https://github.com/Vincit/objection.js/issues/2582)

### Other

- Update knex to 3.3 in development, which fixes inverted bindings in `delete()` with `joinRelated()` [#2799](https://github.com/Vincit/objection.js/issues/2799)

Thanks to @falkenhawk and Marcin L for the many-to-many work in [#2406](https://github.com/Vincit/objection.js/pull/2406), @kapouer for [#2680](https://github.com/Vincit/objection.js/pull/2680) and @cesumilo for [#2625](https://github.com/Vincit/objection.js/pull/2625), which led to `preserveJsonKeys`.

## 3.2.0

Objection is now maintained at [ditojs/objection](https://github.com/ditojs/objection).

### What's new

- Support mixing `withGraphJoined()` and `withGraphFetched()` in the same query. Before, the last method called silently decided the algorithm for all relations. A top-level relation can only be loaded with one of them. [#2269](https://github.com/Vincit/objection.js/issues/2269)
- Add `none()` to make a query match no rows [#2184](https://github.com/Vincit/objection.js/issues/2184)
- `upsertGraph()`: mark individual related models with `#unrelate` or `#delete` [#2410](https://github.com/Vincit/objection.js/pull/2410)
- Return rows from `relate()` with `returning()` [#2044](https://github.com/Vincit/objection.js/issues/2044)
- Apply `select()` to the fetch query of `updateAndFetch()`, `patchAndFetch()` and their `ById` variants [#1938](https://github.com/Vincit/objection.js/issues/1938)
- Add a `noDoubleUnderscores` option to the snake case mappers [#2805](https://github.com/Vincit/objection.js/issues/2805)
- Pass `format` options from `toJSON()` / `$toJson()` to `$formatJson()` of the model and all nested models [#2033](https://github.com/Vincit/objection.js/pull/2033)
- Support `$defs` in JSON schemas [#2576](https://github.com/Vincit/objection.js/pull/2576)

### Fixes

- **Behaviour change:** throw when `for()` is used outside of `relatedQuery()`. It was silently ignored before, so `Model.query().for(1).delete()` deleted **every row** of the table. [#2185](https://github.com/Vincit/objection.js/issues/2185)
- **Behaviour change:** throw when `for()` is called after a write method on a `relatedQuery()`. Before, `update()`, `patch()` and `delete()` silently did nothing, and `insert()` and `relate()` wrote `NULL` foreign keys.
- Fix validators being shared between models with the same `uniqueTag()` but different schemas [#2540](https://github.com/Vincit/objection.js/issues/2540)
- Fix `orderBy()` with refs and raws as array items [#2252](https://github.com/Vincit/objection.js/issues/2252)
- Clear an `orderBy` added at build time, e.g. by a relation's `modify`, from the `resultSize()` and `page()` count query [#2747](https://github.com/Vincit/objection.js/issues/2747)
- Support `Model.ref()` references in relation join mappings [#1873](https://github.com/Vincit/objection.js/issues/1873)
- Reference the bare column in JSON where methods when no JSON path is given, so Postgres can use GIN indexes [#2008](https://github.com/Vincit/objection.js/issues/2008)
- Fix subqueries in join builders on MySQL (`parentQuery.isUpdate is not a function`) [#2407](https://github.com/Vincit/objection.js/pull/2407)
- Make `union()` deduplicate regardless of array size [#2811](https://github.com/Vincit/objection.js/issues/2811)
- Serialize relation modifiers and aliases before the recursion marker in `RelationExpression.toString()` [#2812](https://github.com/Vincit/objection.js/issues/2812)

### Types

- Fix `first()` infinite type recursion in custom query builder methods [#2637](https://github.com/Vincit/objection.js/issues/2637)
- Keep nested relation data type-checked when inserting model data interfaces [#2190](https://github.com/Vincit/objection.js/issues/2190)
- Keep custom query builder types after `throwIfNotFound()`
- Add a `QueryBuilder` constructor typing for custom query builders [#2306](https://github.com/Vincit/objection.js/issues/2306)
- Allow `null` and readonly arrays for `idColumn`, readonly arrays for `jsonAttributes` [#2693](https://github.com/Vincit/objection.js/issues/2693), [#2745](https://github.com/Vincit/objection.js/issues/2745)
- Allow `bigint` values in where methods [#2318](https://github.com/Vincit/objection.js/issues/2318)
- Support object joins, `limit()` / `offset()` with `skipBinding`, and aliased aggregates [#2189](https://github.com/Vincit/objection.js/issues/2189)
- Fix `tableNameFor()` and `tableRefFor()` return and argument types [#2790](https://github.com/Vincit/objection.js/pull/2790)
- Add `knexIdentifierMapping` [#1947](https://github.com/Vincit/objection.js/issues/1947)
- Add `tableName()`, `tableRef()` and `emptyInstance()` to `QueryBuilder` [#2792](https://github.com/Vincit/objection.js/pull/2792), [#2794](https://github.com/Vincit/objection.js/pull/2794)
- Add the column list overload of `with()` [#2749](https://github.com/Vincit/objection.js/issues/2749)
- Fix generic static `this` for `query()`, `fromJson()` and `fetchGraph()` [#2700](https://github.com/Vincit/objection.js/pull/2700)

### Docs

- Document what `afterInsert()` receives as `result` [#2342](https://github.com/Vincit/objection.js/issues/2342)
- Document that `withGraphJoined()` requires a primary key [#2748](https://github.com/Vincit/objection.js/issues/2748)
- Document the `skipUndefined()` deprecation [#2149](https://github.com/Vincit/objection.js/issues/2149)
- Use `declare` for the query builder type properties in the custom query builder and plugin recipes, which fail with TS2612 on ES2022+ targets
- Fix the koa-ts example typings [#2361](https://github.com/Vincit/objection.js/issues/2361)
- Clarify `whereNotColumn()` [#2808](https://github.com/Vincit/objection.js/pull/2808)

### Other

- Drop Node 14 from CI. Objection still supports it, but knex 3 requires Node 16+.

Thanks to everyone whose pull requests made it into this release: @amit-meshbey, @androvonx95, @bilalakbar, @Bolt4243, @cesumilo, @falkenhawk, @geeksilva97, @IlyaSemenov, @kapouer, @kartikdp, @LiahMartens, @max-kahnt-keylight, @nickbouldien, @nickfuryoc, @ralcorta and @salisbury-espinosa.

## 3.1.5

### What's new

- Types: Fix generic static `this` [#2533](https://github.com/Vincit/objection.js/pull/2533)
- Types: Add `fromRaw` to `FromSelector regex [#2628](https://github.com/Vincit/objection.js/issues/2628)
- Types: Fix argument types of `onConflict()` [#2635](https://github.com/Vincit/objection.js/pull/2635)
- Types: Make `trx` optional for `Model.transaction(trx, cb)` [#2694](https://github.com/Vincit/objection.js/pull/2694)

## 3.1.4

### What's new

- Fix `upsertGraph()` `$beforeUpdate()` calls on empty relates [#2605](https://github.com/Vincit/objection.js/issues/2605)
- Don't call `onError()` with internal exceptions [#2603](https://github.com/Vincit/objection.js/issues/2603)
- Remove docs and typings for nonexistent `$pick()`
- Make `$omitFromJson()` + `$omitFromDatabaseJson()` compatible with old `$omit()` syntax

## 3.1.3

### What's new

- Revert generic constructor type change [#2531](https://github.com/Vincit/objection.js/issues/2531), [#2399](https://github.com/Vincit/objection.js/pull/2399)

### What's new

- Patch Validator: Prevent recursion on inner properties [#2520](https://github.com/Vincit/objection.js/pull/2520)

## 3.1.2
  
### What's new

- Patch Validator: Prevent recursion on inner properties [#2520](https://github.com/Vincit/objection.js/pull/2520)

## 3.1.1

### What's new

- Only add Ajv formats if they weren't added in user-land already [#2482](https://github.com/Vincit/objection.js/pull/2482)

## 3.1.0

### What's new

- Support `$beforeUpdate()` mutations in `upsertGraph()` [#2233](https://github.com/Vincit/objection.js/issues/2233)
- Remove deprecated `$afterGet()` hook [#2477](https://github.com/Vincit/objection.js/pull/2477)
- Drop support for Node v12 [#2478](https://github.com/Vincit/objection.js/pull/2478)

## 3.0.5

### What's new

- Fixes [#2183](https://github.com/Vincit/objection.js/pull/2183)
- Fixes [#2257](https://github.com/Vincit/objection.js/pull/2257)
- Fixes [#2276](https://github.com/Vincit/objection.js/pull/2276)
- Fixes [#2453](https://github.com/Vincit/objection.js/pull/2453)
- Fixes [#2476](https://github.com/Vincit/objection.js/pull/2476)

## 3.0.4

### What's new

- Fixes [#2447](https://github.com/Vincit/objection.js/issues/2447)

## 3.0.3

### What's new

- Fixes [#1673](https://github.com/Vincit/objection.js/issues/1673)
- Fixes [#1957](https://github.com/Vincit/objection.js/issues/1957)
- Fixes [#2105](https://github.com/Vincit/objection.js/issues/2105)
- Fixes [#2132](https://github.com/Vincit/objection.js/issues/2132)
- Fixes [#2251](https://github.com/Vincit/objection.js/issues/2251)
- Fixes [#2262](https://github.com/Vincit/objection.js/issues/2262)
- Fixes [#2271](https://github.com/Vincit/objection.js/issues/2271)
- Fixes [#2277](https://github.com/Vincit/objection.js/issues/2277)
- Fixes [#2308](https://github.com/Vincit/objection.js/pull/2308)
- Fixes [#2311](https://github.com/Vincit/objection.js/issues/2311)
- Fixes [#2311](https://github.com/Vincit/objection.js/pull/2311)
- Fixes [#2311](https://github.com/Vincit/objection.js/pull/2311)
- Fixes [#2332](https://github.com/Vincit/objection.js/issues/2332)
- Fixes [#2337](https://github.com/Vincit/objection.js/issues/2337)
- Fixes [#2372](https://github.com/Vincit/objection.js/pull/2372)
- Fixes [#2379](https://github.com/Vincit/objection.js/pull/2379)
- Fixes [#2383](https://github.com/Vincit/objection.js/pull/2383)
- Fixes [#2399](https://github.com/Vincit/objection.js/pull/2399)
- Fixes [#2404](https://github.com/Vincit/objection.js/pull/2404)
- Fixes [#2405](https://github.com/Vincit/objection.js/pull/2405)
- Fixes [#2408](https://github.com/Vincit/objection.js/pull/2408)
- Fixes [#2409](https://github.com/Vincit/objection.js/pull/2409)
- Fixes [#2423](https://github.com/Vincit/objection.js/pull/2423)

## 3.0.2

### What's new

- Fixes [#1356](https://github.com/Vincit/objection.js/issues/1356)
- Fixes [#1957](https://github.com/Vincit/objection.js/issues/1957)
- Fixes [#2192](https://github.com/Vincit/objection.js/issues/2192)
- Fixes [#2247](https://github.com/Vincit/objection.js/pull/2247)
- Fixes [#2307](https://github.com/Vincit/objection.js/pull/2307)
- Fixes [#2308](https://github.com/Vincit/objection.js/pull/2308)
- Fixes [#2311](https://github.com/Vincit/objection.js/pull/2311)
- Fixes [#2323](https://github.com/Vincit/objection.js/pull/2323)
- Fixes [#2337](https://github.com/Vincit/objection.js/issues/2337)
- Fixes [#2362](https://github.com/Vincit/objection.js/pull/2362)

## 3.0.1

### What's new

- Fixes [#2123](https://github.com/Vincit/objection.js/issues/2123)
- Fixes [#2150](https://github.com/Vincit/objection.js/issues/2150)
- Fixes [#2179](https://github.com/Vincit/objection.js/pull/2179)

## 3.0.0

### What's new

- Fixes [#1986](https://github.com/Vincit/objection.js/issues/1986)
- Fixes [#1987](https://github.com/Vincit/objection.js/issues/1987)
- Fixes [#1954](https://github.com/Vincit/objection.js/issues/1954)
- Fixes [#1993](https://github.com/Vincit/objection.js/issues/1993)
- Fixes [#1688](https://github.com/Vincit/objection.js/issues/1688)
- Fixes [#1651](https://github.com/Vincit/objection.js/issues/1651)
- Fixes [#2135](https://github.com/Vincit/objection.js/issues/2135)
- Fixes [#1936](https://github.com/Vincit/objection.js/issues/1936)
- Fixes [#1905](https://github.com/Vincit/objection.js/issues/1905)
- Fixes [#1997](https://github.com/Vincit/objection.js/issues/1997)
- Fixes [#2024](https://github.com/Vincit/objection.js/issues/2024)

### Breaking changes

See the [migration guide](/release-notes/migration.md).

## 2.2.10

### What's new

- Add `modelClass` property for `ValidationError` and `NotFoundError`.

## 2.2.9

### What's new

- Add `noWait` query builder method.

## 2.2.8

### What's new

- Fixes [#1982](https://github.com/Vincit/objection.js/issues/1982)
- Fixes [#1983](https://github.com/Vincit/objection.js/issues/1983)

## 2.2.7

### What's new

- `QueryBuilder.castTo` can now be used to cast query results to any typescript type.

## 2.2.6

### What's new

- Fixes [#1964](https://github.com/Vincit/objection.js/issues/1964)

## 2.2.5

### What's new

- Fixes [#1855](https://github.com/Vincit/objection.js/issues/1855)

## 2.2.4

### What's new

- Add support for onConflict, merge and ignore knex methods.

## 2.2.2

### What's new

- [#1722](https://github.com/Vincit/objection.js/issues/1722)

## 2.2.1

### What's new

- Fixes [#1757](https://github.com/Vincit/objection.js/issues/1757)
- Fixes [#1729](https://github.com/Vincit/objection.js/issues/1729)

## 2.2.0

### What's new

- Fixes [#1770](https://github.com/Vincit/objection.js/issues/1770)
- Fixes [#1699](https://github.com/Vincit/objection.js/issues/1699)
- Fixes [#1703](https://github.com/Vincit/objection.js/issues/1703)
- Fixes [#1675](https://github.com/Vincit/objection.js/issues/1675)
- Fixes [#1708](https://github.com/Vincit/objection.js/issues/1708)
- Fixes [#1743](https://github.com/Vincit/objection.js/issues/1743)
- Fixes [#1731](https://github.com/Vincit/objection.js/issues/1731)
- Fixes [#1761](https://github.com/Vincit/objection.js/issues/1761)

## 2.1.4

### What's new

- Fixes [#1750](https://github.com/Vincit/objection.js/issues/1750)

## 2.1.3

### What's new

- Add `underscoreBetweenUppercaseLetters` option for snake case mappers. [#1676](https://github.com/Vincit/objection.js/issues/1676)

## 2.1.2

### What's new

- Fix `startTransaction` typings.

## 2.1.1

### What's new

- Fixes [#1489](https://github.com/Vincit/objection.js/issues/1489)

## 2.1.0

### What's new

- Fixes [#1638](https://github.com/Vincit/objection.js/issues/1638)
- Fixes [#1636](https://github.com/Vincit/objection.js/issues/1636)
- Fixes [#1615](https://github.com/Vincit/objection.js/issues/1615)

# Changelog

## 2.0.10

### What's new

- Fixes [#1630](https://github.com/Vincit/objection.js/issues/1630)

## 2.0.9

### What's new

- Fixes [#1606](https://github.com/Vincit/objection.js/issues/1606)

## 2.0.8

### What's new

- Fixes [#1627](https://github.com/Vincit/objection.js/issues/1627)

## 2.0.7

### What's new

- Fixes [#1607](https://github.com/Vincit/objection.js/issues/1607)

## 2.0.6

### What's new

- Fixes [#1603](https://github.com/Vincit/objection.js/issues/1603)

## 2.0.5

### What's new

- Fixes `upsertGraph` bug where composite keys were not selected correctly. See the fix [here](https://github.com/Vincit/objection.js/commit/0e58cf010348efc33e5459c055eea141f62f7561).

## 2.0.4

### What's new

- New `skipFetched` option for `fetchGraph` and `$fetchGraph`

## 2.0.3

### What's new

- Fixes [#1585](https://github.com/Vincit/objection.js/issues/1585)
- Fixes [#1361](https://github.com/Vincit/objection.js/issues/1361)
- Fixes [#1488](https://github.com/Vincit/objection.js/issues/1488)

## 2.0.0

### What's new

- Cleaner and more consistent API. A lot of methods have been renamed, removed combined and cleaned up. Most of the old methods still exist, but print a deprecation warning when first used. Some examples:

  - `eager` -> `withGraphFetched`
  - `joinEager` -> `withGraphJoined`
  - removed `eagerAlgorithm` (you must explicitly use either `withGraphFetched` or `withGraphJoined`)
  - merged `allowEager`, `allowInsert` and `allowUpsert` into one method `allowGraph`
  - `$loadRelated` -> `$fetchGraph`
  - `joinRelation` -> `joinRelated`
  - `$relatedQuery` no longer mutates the receiving model instances

- New [static hook API](/guide/hooks.html#static-query-hooks). The old instance hooks are still around.

- `relatedQuery` can now be used for more than just subqueries. See the examples [here](/guide/query-examples.html#relation-queries).

- modifiers can now take arguments and are a lot more useful. See [this recipe](/recipes/modifiers.html) for more info.

- Objection now uses the [db-errors](https://github.com/Vincit/db-errors) library by default to wrap the database errors.

- `insertMissing` `upsertGraph` option now works as expected with `relate: true`: items that are not found in the database are inserted.

- Brand new typings written from scratch with many improvements and finally a support for [custom query builders](/recipes/custom-query-builder.html)

- A bunch of improvements and bug fixes for `upsertGraph`, including a huge speedup in some cases due to less data fetching.

- A brand new [fn](/api/objection/#fn) helper for calling SQL functions.

- Objection now uses native promises instead of bluebird.

- Objection is now leaner as we dropped a bunch of dependencies like `bluebird` and `lodash`.

- In addition to all of this, a huge number of bugs has been squashed!

### Breaking changes

See the [migration guide](/release-notes/migration.md).

## 1.6.10

- Fixes [#1455](https://github.com/Vincit/objection.js/issues/1455)

## 1.6.9

- Revert fix for [#1089](https://github.com/Vincit/objection.js/issues/1089). It was causing more bugs than it fixed. #1089 will be addressed in 2.0.
- Typings updates

## 1.6.8

- Fix [#1287](https://github.com/Vincit/objection.js/issues/1287)

## 1.6.7

- A bunch of regression bug fixes.

## 1.6.3

- Fixes: [#1227](https://github.com/Vincit/objection.js/issues/1227)

## 1.6.2

- Add `as` method for `raw` making it possible to use `raw` expressions in `joinEager` modifiers (as long as you give names to your raw expressions using `as`).

## 1.6.1

- Fix some very rare upsertGraph edge cases.

## 1.6.0

- Add `Model.traverseAsync` and `modelInstance.$traverseAsync` methods.

- Fixes: [#842](https://github.com/Vincit/objection.js/issues/842) and [#1205](https://github.com/Vincit/objection.js/issues/1205). This bug is about subqueries "inheriting" parent query table name and alias. This bug has been around a long time and there is a small chance that people have started accidentally or on purpose use it as a feature. If you get weird reference errors from subqueries (relation not found, table not found etc.) you may need to explicitly give an alias or use `from` in your subqueries after this update. This is a borderline breaking change, but since 2.0 is still pretty far away, I wanted to get this out faster. If I'm wrong and people are heavily depending on this bug, I'll revert the change.

- Fixes: [#1215](https://github.com/Vincit/objection.js/issues/1215)
- Fixes: [#1206](https://github.com/Vincit/objection.js/issues/1206)

## 1.5.3

### What's new

- Fixes [#1204](https://github.com/Vincit/objection.js/issues/1204)

## 1.5.1

### What's new

- Relations are now loaded lazily [#1202](https://github.com/Vincit/objection.js/issues/1202)
- `relationMappings.modelClass` can now be a function that returns a model class.

## 1.5.0

### What's new

- fix [#1131](https://github.com/Vincit/objection.js/issues/1131)
- fix [#1114](https://github.com/Vincit/objection.js/issues/1114)
- fix [#1185](https://github.com/Vincit/objection.js/issues/1185)
- fix [#1109](https://github.com/Vincit/objection.js/issues/1109)
- fix [#1110](https://github.com/Vincit/objection.js/issues/1110)
- add eagerObject and eagerModifiers accessors to QueryBuilder.
- complete rewrite of `insertGraph` and `upsertGraph` code. The rewrite brought a bunch of small performance optimizations and makes future development easier. No breaking changes.
- Chaining `returning('*')` to `insertGraph` or `upsertGraph` now propagates the call to all insert, update and delete operations.
- Code using objectio can now be transpilsed to ES5. No need to add babel workarounds anymore.

## 1.4.0

### What's new

- Add `modifierNotFound` hook [#1120](https://github.com/Vincit/objection.js/issues/1120)
- fix [#1121](https://github.com/Vincit/objection.js/issues/1121)
- fix [#1126](https://github.com/Vincit/objection.js/issues/1126)

## 1.3.0

### What's new

- Use `objection.raw` instead of `knex.raw` in `Model.raw`. [#1077](https://github.com/Vincit/objection.js/issues/1077)
- Allow modifiers (namedFilters) to be used in `modifyEager` too.
- Add `underscoreBeforeDigits` option for snake case converters. [#1025](https://github.com/Vincit/objection.js/issues/1025)
- fix [#1074](https://github.com/Vincit/objection.js/issues/1074)
- Typing fixes

## 1.2.3

### What's new

- fix [#1007](https://github.com/Vincit/objection.js/issues/1007)
- fix [#1008](https://github.com/Vincit/objection.js/issues/1008)
- fix [#1047](https://github.com/Vincit/objection.js/issues/1047)

## 1.2.2

### What's new

- Improve reference cycle detection in `upsertGraph`

## 1.2.1

### What's new

- fix [#1009](https://github.com/Vincit/objection.js/issues/1009)

## 1.2.0

### What's new

- fix [#919](https://github.com/Vincit/objection.js/issues/919)
- fix [#964](https://github.com/Vincit/objection.js/issues/964)
- Add `aliasFor` method to public API
- Prevent bluebird warnings
- UPPER_SNAKE_CASE support for `snakeCaseMappers` and `knexSnakeCaseMappers`

## 1.1.10

### What's new

- Nothing! the npm release was somehow borked. This was just a rerelease of 1.1.9.

## 1.1.9

### What's new

- fix [#782](https://github.com/Vincit/objection.js/issues/782)

## 1.1.8

### What's new

- fix [#909](https://github.com/Vincit/objection.js/issues/909)

## 1.1.7

### What's new

- fix [#884](https://github.com/Vincit/objection.js/issues/884)

## 1.1.6

### What's new

- Add typings for fetchTableMetadata, tableMetadata and onbuildknex

## 1.1.5

### What's new

- Make [Model.fetchTableMetadata](/api/model/static-methods.html#static-fetchtablemetadata) and [Model.tableMetadata](/api/model/static-methods.html#static-tablemetadata) methods public. [#871](https://github.com/Vincit/objection.js/issues/871)
- Add [onBuildKnex](/api/query-builder/other-methods.html#onbuildknex) query builder hook. [#807](https://github.com/Vincit/objection.js/issues/807)

## 1.1.4

### What's new

- fix subquery bug causing incompatibility with knex 0.14.5 and sqlite3

## 1.1.3

### What's new

- fix regression in 1.1.2 (sorry about this) [#869](https://github.com/Vincit/objection.js/issues/869)

## 1.1.2

### What's new

- Add `virtuals` option for `toJSON` and `$toJson` [#866](https://github.com/Vincit/objection.js/issues/866)
- fix [#868](https://github.com/Vincit/objection.js/issues/868)

## 1.1.1

### What's new

- fix [#865](https://github.com/Vincit/objection.js/issues/865)
- fix bug where the static `Model.relatedQuery` didn't use the relation name as an alias for the table. This may break
  code if you have explicitly referenced the subquery table. [#859](https://github.com/Vincit/objection.js/issues/859)

## 1.1.0

### What's new

- Optional [object notation](/api/types/#relationexpression-object-notation) for relation expressions.
- fix [#855](https://github.com/Vincit/objection.js/issues/855)
- fix [#858](https://github.com/Vincit/objection.js/issues/858)

## 1.0.1

### What's new

- Added public [Relation.joinModelClass](/api/types/#class-relation) accessor
- Don't call `returning` on sqlite (prevents a warning message added in knex 0.14.4)
- fix [#844](https://github.com/Vincit/objection.js/issues/844)
- Small documentation updates
- Small typing fixes end updates

## 1.0.0 🎉

### What's new

- The static [`relatedQuery`](/api/model/static-methods.html#static-relatedquery) method.
- New reflection methods:
  [`isFind`](/api/query-builder/other-methods.html#isfind),
  [`isInsert`](/api/query-builder/other-methods.html#isinsert),
  [`isUpdate`](/api/query-builder/other-methods.html#isupdate),
  [`isDelete`](/api/query-builder/other-methods.html#isdelete),
  [`isRelate`](/api/query-builder/other-methods.html#isrelate),
  [`isUnrelate`](/api/query-builder/other-methods.html#isunrelate),
  [`hasWheres`](/api/query-builder/other-methods.html#haswheres),
  [`hasSelects`](/api/query-builder/other-methods.html#hasselects),
  `hasEager`,
  [`has`](/api/query-builder/other-methods.html#has).
  [`clear`](/api/query-builder/other-methods.html#clear).
  [`columnNameToPropertyName`](/api/model/static-methods.html#static-columnnametopropertyname),
  [`propertyNameToColumnName`](/api/model/static-methods.html#static-propertynametocolumnname).
- `ManyToMany` extras now work consistently in queries and filters. [#760](https://github.com/Vincit/objection.js/issues/760)

### Breaking changes

- `modelInstance.$query().delete().returning(something)` now returns a single instance instead of an array. [#659](https://github.com/Vincit/objection.js/issues/659)

- Node 6.0.0 is now the minimum. Objection will not work on node < 6.0.0.

- [`ValidationError`](/api/types/#class-validationerror) overhaul. This is a big one, so read this carefully! There are three things to check when you migrate to 1.0:

  1. The [`createValidationError`](/api/model/static-methods.html#static-createvalidationerror) and [`ValidationError`](/api/types/#class-validationerror) interfaces have changed.
     If you have overridden the `createValidationError` method in your project, or you create custom `ValidationError` instances
     you need migrate to the interfaces.
  2. The model validation errors (jsonSchema violations) have remained pretty much the same but there are couple of differences. Before, the
     keys of `error.data` were property names even when a nested object in a graph failed a validation. Now the keys for nested
     validation errors are key paths like `foo.bar[2].spam`. Another tiny difference is the order of validation errors for each key in
     `error.data`. Let's say a property `spam` failed for your model and `error.data.spam` contains an array of objects that describe
     the failures. Before, the first failed validation was the last item in the array, now it is the first item.
  3. All [`ValidationErrors`](/api/types/#class-validationerror) now have a `type` field. Before all [`ValidationErrors`](/api/types/#class-validationerror) but the model
     validation errors (errors like "invalid relation expression", or "cyclic model graph") had no type, and could only be identified
     based on the existence of some weird key in `error.data`. The `error.data` is now removed from those errors and the `type` should be
     used instead. The message from the data is now stored in `error.message`.

- Removed deprecated methods `whereRef`, `whereJsonField` and `whereJsonEquals`. The [`ref`](/api/objection/#ref) helper can be used to replace the
  `whereRef` calls. [`ref`](/api/objection/#ref) and `lit` can be used to replace the removed json methods.

- `ManyToMany` extras now work consistently in queries and filters. [#760](https://github.com/Vincit/objection.js/issues/760). This is not
  a breaking change per se, but can cause some queries to fail with a "ambiguous identifier" error because the join table is now joined
  in places where it previously wasn't. You need to explicitly specify the table for those failing columns using `Table.theColumn` syntax.

### Changes

- `isFindQuery` is renamed to [`isFind`](/api/query-builder/other-methods.html#isfind) and deprecated.

## 0.9.4

### What's new

- Fixed [#627](https://github.com/Vincit/objection.js/issues/627)
- Fixed [#671](https://github.com/Vincit/objection.js/issues/671)
- Fixed [#672](https://github.com/Vincit/objection.js/issues/672)
- Fixed [#674](https://github.com/Vincit/objection.js/issues/674)

## 0.9.3

### What's new

- Add beforeInsert hook for relations. [#649](https://github.com/Vincit/objection.js/issues/649) [#19](https://github.com/Vincit/objection.js/issues/19)
- Add `relatedFindQueryMutates` and `relatedInsertQueryMutates` configs as well as [`$setRelated`](/api/model/instance-methods.html#setrelated) and [`$appendRelated`](/api/model/instance-methods.html#appendrelated) helpers. [#599](https://github.com/Vincit/objection.js/issues/599)
- Fixed [#648](https://github.com/Vincit/objection.js/issues/648)

## 0.9.2

### What's new

- Fix regression: `from` fails with a subquery.

## 0.9.1

### What's new

- [`castTo`](/api/query-builder/other-methods.html#castto) method for setting the model class of query result rows.
- [`onError`](/api/query-builder/other-methods.html#onerror) `QueryBuilder` method.
- [`knexSnakeCaseMappers`](/api/objection/#knexsnakecasemappers) and [`snakeCaseMappers`](/api/objection/#snakecasemappers) for snake_case to camelCase conversions.

## 0.9.0

### What's new

- Relations can now be defined using keys inside JSON columns. See the examples [here](/api/model/static-properties.html#static-relationmappings).
- `lit` helper function [#275](https://github.com/Vincit/objection.js/issues/275)
- Fixes for [`upsertGraph`](/api/query-builder/mutate-methods.html#upsertgraph) when using composite keys. [#517](https://github.com/Vincit/objection.js/issues/517)
- Added `noDelete`, `noUpdate`, `noInsert`, `noRelate` and `noUnrelate` options for `upsertGraph`. See [UpsertGraphOptions docs](/api/types/#type-upsertgraphoptions) for more info.
- `insertGraph` now accepts an options object just like `upsertGraph`. `relate` option can be used instead of `#dbRef`. [#586](https://github.com/Vincit/objection.js/issues/586)

### Breaking changes

- Instance update/patch with `returning` now return a single object instead of an array. [#423](https://github.com/Vincit/objection.js/issues/423)

- Because of the support for JSON relations [the `Relation` class](/api/types/#class-relation)
  has changed a bit.

## 0.8.8

### What's new

- Typing updates: [#489](https://github.com/Vincit/objection.js/issues/489) [#487](https://github.com/Vincit/objection.js/issues/487)
- Improve `resultSize` method. [#213](https://github.com/Vincit/objection.js/issues/213)
- Avoid unnecessary updates in upsertGraph [#480](https://github.com/Vincit/objection.js/issues/480)

## 0.8.7

### What's new

- `throwIfNotFound` now also throws when update or delete doesn't change any rows.
- [`mixin`](/api/objection/#mixin) and [`compose`](/api/objection/#compose) helpers for applying multiple plugins. [#475](https://github.com/Vincit/objection.js/issues/475) [#473](https://github.com/Vincit/objection.js/issues/473)
- Typing updates [#474](https://github.com/Vincit/objection.js/issues/474) [#479](https://github.com/Vincit/objection.js/issues/479)
- `upsertGraph` now validates patched models correctly. [#477](https://github.com/Vincit/objection.js/issues/477)

## 0.8.6

### What's new

- Finally: the first version of [`upsertGraph`](/guide/query-examples.html#graph-upserts) method! Please open issues about bugs, WTFs and missing features.
- Strip readonly virtual properties in fromJson & friends [#432](https://github.com/Vincit/objection.js/issues/432)
- Fixed [#439](https://github.com/Vincit/objection.js/issues/439)

## 0.8.5

### What's new

- Add [`Model.useLimitInFirst`](/api/model/static-properties.html#static-uselimitinfirst) configuration flag.

## 0.8.4

### What's new

- New shorthand methods `joinEager`, `naiveEager`,
  `mergeJoinEager` and `mergeNaiveEager`.
- New shorthand method [`findOne`](/api/query-builder/find-methods.html#findone)
- New reflection method [`isFindQuery`](/api/query-builder/other-methods.html#isfind)
- ManyToMany extra properties can now be updated [#413](https://github.com/Vincit/objection.js/issues/413)

## 0.8.3

### What's new

- `NaiveEagerAlogrithm`
- [Aliases in relation expressions](/api/types/#type-relationexpression) [#402](https://github.com/Vincit/objection.js/issues/402)
- New lazily evaluated `raw` function. [#275](https://github.com/Vincit/objection.js/issues/275)

## 0.8.2

### What's new

- `Model.namedFilters` object for defining shared filters that can be used by name in eager expressions.
- Full support for views and table aliases in eager, join, joinRelation etc. [#181](https://github.com/Vincit/objection.js/issues/181)
- Fix `bindTransaction` bug with `ManyToManyRelation` junction tables [#395](https://github.com/Vincit/objection.js/issues/395)

## 0.8.1

### What's new

- [`throwIfNotFound`](/api/query-builder/other-methods.html#throwifnotfound) method for making empty query results throw an exception.
- fix error when passing model instance to a `where` method. [#387](https://github.com/Vincit/objection.js/issues/387)

## 0.8.0

### What's new

- All query methods now call `Model.query` to create a `QueryBuilder` instance [#346](https://github.com/Vincit/objection.js/issues/346)
- Objection is no longer transpiled. One of the implications is that you can use a github
  link in package.json to test experimental versions.
- `count` can now be called without arguments [#364](https://github.com/Vincit/objection.js/issues/364)
- A new [`getRelations`](/api/model/static-methods.html#static-getrelations) method for plugin development and other reflection greatness.

### Breaking changes

> Old model definition

```js
function Person() {
  Model.apply(this, arguments);
}

Model.extend(Person);

Person.tableName = 'Person';

Person.prototype.fullName = function () {
  return this.firstName + ' ' + this.lastName;
};

// More static and prototype methods.
```

> Easiest way to migrate to `class` and `extends` keywords

```js
class Person extends Model {}

Person.tableName = 'Person';

Person.prototype.fullName = function () {
  return this.firstName + ' ' + this.lastName;
};

// More static and prototype methods.
```

- Support for node versions below 4.0.0 has been removed. With it the support for legacy class inheritance using `Model.extend` method
  has also been removed. This means that you need to change your model definitions to use the `class` and `extends` keywords.
  To achieve this with the minimum amount of changes you can simply swap the constructor function and `Model.extend` to
  a class definition. You can still define all static and prototype methods and properties the old way. See the example on the right -->

  Note that this also affects Babel transpilation. You cannot (or need to) use `babel-plugin-transform-es2015-classes` anymore.
  See the [ESNext example project](https://github.com/Vincit/objection.js/tree/0.8.0/examples/express-es7) as an example of
  how to setup babel.

- The default value of [`pickJsonSchemaProperties`](/api/model/static-properties.html#static-pickjsonschemaproperties) was changed to `false`. Before, all properties that
  were not listed in `jsonSchema` were removed before `insert`, `patch` or `update` (if `jsonSchma` was defined). Starting from
  this version you need to explicitly set the value to `true`. You may have been used this feature by accident.
  If you have weird problems after the update, try setting `objection.Model.pickJsonSchemaProperties = true;` to see
  if it helps.

- [`relate`](/api/query-builder/mutate-methods.html#relate) and [`unrelate`](/api/query-builder/mutate-methods.html#unrelate) methods now return the result of the
  underlying query (`patch` in case of `HasManyRelation`, `HasOneRelation`, and `BelongsToOneRelation`. `insert` otherwise).
  Before the method input was always returned.

- `Model.RelatedQueryBuilder` is removed. `Model.QueryBuilder` is now used to create all query builders for the model.
  This only affects you if you have defined custom query builders.

## 0.7.12

### What's new

- fix [#345](https://github.com/Vincit/objection.js/issues/345)

## 0.7.11

### What's new

- fix [#339](https://github.com/Vincit/objection.js/issues/339)
- fix [#341](https://github.com/Vincit/objection.js/issues/341)

## 0.7.10

### What's new

- fix bugs that prevented using `$relatedQuery` and `eager` together with `JoinEagerAlgorithm`
- typing updates

## 0.7.9

### What's new

- `joinRelation` now accepts [`RelationExpressions`](/api/types/#type-relationexpression) and can join multiple and nested relations.

## 0.7.6

### What's new

- `range` and `page` methods now use a window function and only generate one query on postgresql [#62](https://github.com/Vincit/objection.js/issues/62)
- fix MSSQL 2100 parameter limit in eager queries [#311](https://github.com/Vincit/objection.js/issues/311)

## 0.7.5

### What's new

- fix [#327](https://github.com/Vincit/objection.js/issues/327)
- fix [#256](https://github.com/Vincit/objection.js/issues/256)

## 0.7.4

### What's new

- automatically select columns needed for relations [#309](https://github.com/Vincit/objection.js/issues/309)
- fix an issue where `$formatJson` was called inside `insertGraph` [#326](https://github.com/Vincit/objection.js/issues/326)

## 0.7.3

### What's new

- fix [#325](https://github.com/Vincit/objection.js/issues/325)
- fix an issue where `select` had to be used in addition to `distinct` in some cases

## 0.7.2

### What's new

- `HasOneThroughRelation` relation type.

## 0.7.1

### What's new

- fix `JoinEagerAlgorithm` NPE bug

## 0.7.0

### What's new

- `jsonSchema` without `properties` now works. [#205](https://github.com/Vincit/objection.js/issues/205)
- `relationMappings` can now be a function. [#227](https://github.com/Vincit/objection.js/issues/227)
- many to many extras can now be aliased. [#223](https://github.com/Vincit/objection.js/issues/223)
- zero values are now allowed in relation columns. [#228](https://github.com/Vincit/objection.js/issues/228)
- active transaction can now be accessed in `$before/$after` hooks through `queryContext.transaction` property.
- Validation can now be easily modified through a new [`Validator`](/api/types/#class-validator) interface. [#241](https://github.com/Vincit/objection.js/issues/241) [#199](https://github.com/Vincit/objection.js/issues/199)
- fix a `JoinEager` problem where an empty result for a relation caused the following relations to be empty. [#292](https://github.com/Vincit/objection.js/issues/292)
- `ref(fieldExpression)` syntax to reduce need for knex.raw and updating single attribute inside JSON column. [#270](https://github.com/Vincit/objection.js/issues/270)
- mergeEager method.

### Breaking changes

- `$relatedQuery` now returns a single model instead of an array for belongsToOne and hasOne relations. [#155](https://github.com/Vincit/objection.js/issues/155)
- identifier of a model can now be updated. Be careful with this one! Before if you forgot a wrong id in an `update`/`patch` operation, it would simply get ignored. Now the id is also updated just like any other column [#100](https://github.com/Vincit/objection.js/issues/100)
- `Table.*` is now selected by default in all queries instead of `*`. This will break some join queries that don't have an explicit select clause. [#161](https://github.com/Vincit/objection.js/issues/161)
- `ValidationError.data` is now an object including, for each key, a list of errors with context info. [#283](https://github.com/Vincit/objection.js/issues/283)

## 0.6.2

### What's new

- `relationMappings` can now be a function [#227](https://github.com/Vincit/objection.js/issues/227)

## 0.6.1

### What's new

- fix bug [#205](https://github.com/Vincit/objection.js/issues/205)

## 0.6.0

### What's new

- Eager loading can now be done using joins and zero extra queries. See `eagerAlgorithm`, `defaultEagerAlgorithm` and `eager` for more info.
- `#ref` in graph inserts can now contain extra properties for many-to-many relations [#156](https://github.com/Vincit/objection.js/issues/156)
- `#dbRef` can now be used to refer to existing rows from a `insertWithRelated` graph.
- [`modelPaths`](/api/model/static-properties.html#static-modelpaths) attribute for cleaner way to point to models in relationMappings.
- [`pickJsonSchemaProperties`](/api/model/static-properties.html#static-pickjsonschemaproperties) config parameter [#110](https://github.com/Vincit/objection.js/issues/110)
- [`insertGraphAndFetch`](/api/query-builder/mutate-methods.html#insertgraphandfetch) with `insertWithRelatedAndFetch` alias. [#172](https://github.com/Vincit/objection.js/issues/172)
- Added [`$beforeDelete`](/api/model/instance-methods.html#beforedelete) and [`$afterDelete`](/api/model/instance-methods.html#afterdelete) hooks [#112](https://github.com/Vincit/objection.js/issues/112)
- Old values can now be accessed from `$beforeUpdate`, `$afterUpdate`, `$beforeValidate` and `$afterValidate` hooks [#185](https://github.com/Vincit/objection.js/issues/185)
- Support length property [#168](https://github.com/Vincit/objection.js/issues/168)
- Make sure operations are executed in the order they are called [#180](https://github.com/Vincit/objection.js/issues/180)
- Fetch nothing if the `where` clauses hit no rows in `update/patchAndFetchById` methods [#189](https://github.com/Vincit/objection.js/issues/189)
- Lots of performance tweaks.
- `$loadRelated` and `loadRelated` now return a `QueryBuilder`.

### Breaking changes

- Undefined values as query method arguments now throw an exception. Before they were just silently ignored
  and for example `delete().where('id', undefined)` caused the entire table to be deleted. [skipUndefined](/api/query-builder/other-methods.html#skipundefined)
  method can be called for a query builder to handle the undefined values the old way.

- Deprecated method `dumpSql` is now removed.

- `$loadRelated` and `loadRelated` now return a `QueryBuilder`. This may break your code is some rare cases
  where you have called a non-standard promise method like `reflect` for the return value of these functions.

## 0.5.5

### What's new

- [Virtual attributes](/api/model/static-properties.html#static-virtualattributes)

## 0.5.4

### What's new

- bugfix: insertWithRelated now works with `additionalProperties = false` in `jsonSchema`
- Add updateAndFetch and patchAndFetch methods for `$query`
- bugfix: afterGet was not called for nested models in eager query
- Use ajv instad of tv4 for json schema validation

## 0.5.3

### What's new

- ES6 promise compatibility fixes.

## 0.5.1

### What's new

- \$afterGet hook.

## 0.5.0

### What's new

- joinRelation family of query builder methods.
- `HasOneRelation` for creating inverse one-to-one relations.
- Relations have been renamed `OneToOneRelation` --> `BelongsToOneRelation`, `OneToManyRelation` --> `HasManyRelation`.
  The old names work, but have been deprecated.
- [withSchema](/api/query-builder/find-methods.html#withschema) now works as expected and sets the schema of all queries executed by the query builder the
  method is called for.
- filterEager method for better eager query filtering.
- [extra properties](/api/model/static-properties.html#static-relationmappings) feature for selecting/inserting columns from/to the join table in many-to-many relations.
- Eager query recursion depth can be controlled like so: `parent.^5`.

## 0.4.0

### What's new

- Query context feature. See [#51](https://github.com/Vincit/objection.js/issues/51) and [these docs](/api/query-builder/other-methods.html#context) for more info.
- Composite key support.
- [findById](/api/query-builder/find-methods.html#findbyid), [deleteById](/api/query-builder/mutate-methods.html#deletebyid), [whereComposite](/api/query-builder/find-methods.html#wherecomposite) and
  [whereInComposite](/api/query-builder/find-methods.html#whereincomposite) query builder methods.

### Breaking changes

There shouldn't be any major breaking changes. We moved from ES5 to ES7 + babel in this version so there are big changes
in the codebase. If something comes up, please open an issue.

There are a few known corner cases that may break:

- You can now define a model for the join table of `ManyToMany` relations in `relationMappings`. This is optional,
  but may be needed if you already have a model for a `ManyToMany` relation _and_ you use `snake_case`
  to `camelCase` conversion for the column names. See the documentation on the [through](/api/types/#type-relationthrough)
  property of [relationMappings](/api/model/static-properties.html#static-relationmappings).

- The repo no longer contains the actual built javascript. Only the ES7 code that is transpiled when the code is
  published to npm. Therefore you can no longer specify a git hash to package.json to use for example the
  HEAD version. We will start to publish alpha and RC versions to npm when something new and experimental
  is added to the library.

## 0.3.3

### What's new

- fix regression: QueryBuilder.from is broken.

## 0.3.2

### What's new

- Improved relation expression whitespace handling.

## 0.3.1

### What's new

- `whereJson*` methods can now be used inside functions given to `where` methods.
- Added multiple missing knex methods to `QueryBuilder`.

## 0.3.0

### What's new

- insertWithRelated method for
  inserting model trees
- [insertAndFetch](/api/query-builder/mutate-methods.html#insertandfetch),
  [updateAndFetchById](/api/query-builder/mutate-methods.html#updateandfetchbyid) and
  [patchAndFetchById](/api/query-builder/mutate-methods.html#patchandfetchbyid) helper methods
- Filters for eager expressions
- [New alternative way to use transactions](/guide/transactions.html)
- Many performance updates related to cloning, serializing and deserializing model trees.

### Breaking changes

- QueryBuilder methods `update`, `patch` and `delete` now return the number of affected rows.
  The new methods `updateAndFetchById` and `patchAndFetchById` may help with the migration
- `modelInstance.$query()` instance method now returns a single model instead of an array
- Removed `Model.generateId()` method. `$beforeInsert` can be used instead

## 0.2.8

### What's new

- ES6 inheritance support
- generator function support for transactions
- traverse,pick and omit methods for Model and QueryBuilder
- bugfix: issue #38

## 0.2.7

### What's new

- bugfix: fix #37 also for `$query()`.
- Significant `toJson`/`fromJson` performance boost.

## 0.2.6

### What's new

- bugfix: fix regression bug that broke dumpSql.

## 0.2.5

### What's new

- bugfix: fix regression bug that prevented values assigned to `this` in `$before` callbacks from getting into
  the actual database query

## 0.2.4

### What's new

- bugfix: many-to-many relations didn't work correctly with a snake_case to camelCase conversion
  in the related model class.

## 0.2.3

### What's new

- Promise constructor is now exposed through `require('objection').Promise`.

## 0.2.2

### What's new

- $beforeUpdate, $afterUpdate, \$beforeInsert etc. are now asynchronous and you can return promises from them.
- Added `Model.fn()` shortcut to `knex.fn`.
- Added missing `asCallback` and `nodeify` methods for `QueryBuilder`.

## 0.2.1

### What's new

- bugfix: Chaining `insert` with `returning` now returns all listed columns.

## 0.2.0

### What's new

- New name `objection.js`.
- `$beforeInsert`, `$afterInsert`, `$beforeUpdate` and `$afterUpdate` hooks for `Model`.
- Postgres jsonb query methods: `whereJsonEquals`, `whereJsonSupersetOf`, `whereJsonSubsetOf` and friends.
- `whereRef` query method.
- Expose `knex.raw()` through `Model.raw()`.
- Expose `knex.client.formatter()` through `Model.formatter()`.
- `QueryBuilder` can be used to make sub queries just like knex's `QueryBuilder`.
- Possibility to use a custom `QueryBuilder` subclass by overriding `Model.QueryBuilder`.
- Filter queries/objects for relations.
- A pile of bug fixes.

### Breaking changes

- Project was renamed to objection.js. Migrate simply by replacing `moron` with `objection`.

## 0.1.0

First release.
