# Migration from objection 3.x to 4.0

This section lists the breaking changes in objection 4.0.

- [objection is an ES module package](#objection-is-an-es-module-package)
- [Dropped support for node < 20.19](#dropped-support-for-node-20-19)
- [Dropped support for knex < 3.3](#dropped-support-for-knex-3-3)
- [Database errors are objection's own classes](#database-errors-are-objection-s-own-classes)
- [Model files given as paths](#model-files-given-as-paths)
- [skipUndefined() is removed](#skipundefined-is-removed)
- [onConflict() with insertGraph() and upsertGraph() throws](#onconflict-with-insertgraph-and-upsertgraph-throws)
- [Relation expressions that name a relation twice throw](#relation-expressions-that-name-a-relation-twice-throw)
- [Unknown graph options throw](#unknown-graph-options-throw)
- [typescript: The typings are ES module declarations](#typescript-the-typings-are-es-module-declarations)
- [Static hooks get an empty `result` instead of `[null]`](#static-hooks-get-an-empty-result-instead-of-null)
- [`limit`, `offset` and `first` apply per parent in graph modifiers](#limit-offset-and-first-apply-per-parent-in-graph-modifiers)
- [typescript: insertGraph() has no allowMarkers option](#typescript-insertgraph-has-no-allowmarkers-option)
- [typescript: RelateQueryBuilder takes the number query builder](#typescript-relatequerybuilder-takes-the-number-query-builder)
- [`insert` and `update` reject field expression keys](#insert-and-update-reject-field-expression-keys)
- [`snakeCaseMappers` keeps the JSON keys of field expressions](#snakecasemappers-keeps-the-json-keys-of-field-expressions)

## objection is an ES module package

objection is now published as an ES module only. Import it like any other ES module:

```js
import { Model, raw, ref } from 'objection';
```

objection has no default export. Replace `import objection from 'objection'` with a namespace import, which contains the same values:

```js
import * as objection from 'objection';
```

CommonJS code can still load objection with `require()`, because node 20.19 and newer can `require()` ES modules that don't use top-level await:

```js
const { Model, raw, ref } = require('objection');
```

`require('objection')` returns the module namespace object, with all the named exports.

The package now has an `exports` map, so only `objection` and `objection/package.json` can be imported. Deep imports of internal files like `objection/lib/...` no longer work.

## Dropped support for node < 20.19

Objection 4.0 needs at least node 20.19, the first version of node 20 that can `require()` ES modules without a flag. Node 22 needs at least 22.12.

## Dropped support for knex < 3.3

Objection 4.0 needs at least knex 3.3.

## Dropped support for TypeScript < 5.8

The typings of objection 4.0 need at least TypeScript 5.8, the first version that understands that node can `require()` ES modules. TypeScript 5.8, 6 and 7 are supported.

## Database errors are objection's own classes

The database error classes (`DBError`, `UniqueViolationError`, `NotNullViolationError`, `ForeignKeyViolationError`, `ConstraintViolationError`, `CheckViolationError` and `DataError`) are no longer imported from the [db-errors](https://github.com/Vincit/db-errors) library. objection includes its own copy of it, and doesn't depend on the `db-errors` package anymore.

The classes have the same names and properties, but `instanceof` checks against classes imported directly from the `db-errors` package no longer match the errors objection throws. Import the classes from objection instead:

```js
// Before:
const { UniqueViolationError } = require('db-errors');

// After:
import { UniqueViolationError } from 'objection';
```

## Model files given as paths

`modelClass` can still be an absolute file path, or a module name resolved using [modelPaths](/api/model/static-properties.html#static-modelpaths). objection loads the file synchronously with `require()`, so the file can be a CommonJS module or an ES module. An ES module needs to export the model class as its default export, or as its only exported model class.

ES module model files can't use top-level await, or import modules that do, because `require()` can't load those. Paths without a file extension are resolved like `require()` resolves them, which finds `.js` files, but not `.mjs` files. Give the full file name for those, or pass the model class itself, or a function that returns it, which also avoids the problem of circular imports.

## skipUndefined() is removed

The deprecated `skipUndefined()` method is removed. `undefined` values passed to `where()` and the other SQL builder methods, and `undefined` ids, throw. Leave out the calls with `undefined` values instead:

```js
// Before:
Person.query().skipUndefined().where('firstName', req.query.firstName);

// After:
const query = Person.query();

if (req.query.firstName !== undefined) {
  query.where('firstName', req.query.firstName);
}
```

## onConflict() with insertGraph() and upsertGraph() throws

`insertGraph()`, `upsertGraph()` and their `*AndFetch()` variants throw an error when the query also uses `onConflict()`, `ignore()` or `merge()`. 3.x ignored these clauses and logged a warning. A graph is inserted using many insert queries, so there's no single query to apply the clause to. Insert the rows that may conflict using a separate `insert()` query and relate them in the graph, for example using `#dbRef` or the `relate` option.

## Relation expressions that name a relation twice throw

Relation expressions that name a relation twice at the same level, like `'[movies.reviews, movies.actors]'` or `'[movies, movies.reviews]'`, throw an error. 3.x logged a warning and only used the last one. This applies to `withGraphFetched()`, `withGraphJoined()`, `allowGraph()`, `joinRelated()` and all other methods that take relation expressions, and to the graph options of `insertGraph()` and `upsertGraph()`. Merge the relations instead, like `'movies.[reviews, actors]'`, or name the deepest relation only, like `'movies.reviews'`, which also loads `movies`. Graph options can use an array like `['movies', 'movies.reviews']` to match a relation together with relations below it.

## Unknown graph options throw

`insertGraph()`, `upsertGraph()` and their `*AndFetch()` variants throw an error for unknown keys in their options, like a misspelled `noInset` instead of `noInsert`. 3.x ignored them and logged a warning, so the operation ran with the default behaviour. `insertGraph()` also throws for the options of `upsertGraph()` that have no effect on an insert, which 3.x ignored silently: `noUpdate`, `noDelete`, `noUnrelate`, `insertMissing`, `update`, `unrelate`, `fetchStrategy` and `allowMarkers`. It accepts `relate`, `noRelate`, `noInsert` and `allowRefs`. Fix or remove the reported keys.

## insertGraph() throws for new models below related models

`insertGraph()` throws a `ValidationError` of type `InvalidGraph` for new models (models without id) below models that it relates, naming their data path. 3.x ignored them and logged a warning, as `insertGraph()` never writes anything below related models. Insert them with a separate query, or use `upsertGraph()` with the `relate` option, which also upserts the relations of related models. Models with ids below related models, like fetched models with loaded relations, are still ignored.

## typescript: The typings are ES module declarations

The typings no longer use `export =`. They declare the named exports of the ES module they describe. Apart from the default import, ES module and bundler projects need no changes.

TypeScript projects that compile to CommonJS can `require()` objection with `"module": "nodenext"`. With `"module": "node16"`, TypeScript refuses to `require()` objection from CommonJS files. On TypeScript < 7, projects that use `"module": "commonjs"` with the old `"moduleResolution": "node"` keep working. TypeScript 7 removed that resolution mode, so CommonJS projects need `"module": "nodenext"` there.

## Static hooks get an empty `result` instead of `[null]`

Where a static hook has no result to pass on, its `result` is now `[]` instead of `[null]`:

- in all `before*` hooks, which run before there is a result
- in `afterFind` of a query for a to-one relation that finds no related model, e.g. `pet.$relatedQuery('owner')` for a pet without owner

Code that checked for the `null` entry, e.g. `result[0] === null`, can check `result.length === 0` instead.

## `limit`, `offset` and `first` apply per parent in graph modifiers

The `limitPerParent` [graph option](/api/types/#type-graphoptions) of `withGraphFetched` defaults to `true`, so `limit`, `offset` and `first` in graph modifiers and in the `modify` of relation mappings apply to the related items of each parent instead of to the whole query that fetches the relation for all parents:

```js
// Up to three pets per person. In 3.x, up to three pets for all persons together.
const people = await Person.query()
  .withGraphFetched('pets(latest)')
  .modifiers({
    latest: (query) => query.orderBy('createdAt', 'desc').limit(3)
  });
```

The relation query becomes a subquery, and its order moves into a `row_number()` window function. The order can only refer to the related table's columns that are selected and to the aliases of the result columns, see [limiting related items per parent](/api/query-builder/eager-methods.html#limiting-related-items-per-parent). MySQL before 8 has no window functions, so objection fetches relations with a limit with one query per parent there, and builds every fetched relation query once more to find its limit, which runs the relation's `modify` and the `onBuild` and `onBuildKnex` hooks twice.

To keep the behaviour of 3.x, set `limitPerParent: false` in the graph options, or in [defaultGraphOptions](/api/model/static-properties.html#static-defaultgraphoptions) for all queries of a model.

## typescript: insertGraph() has no allowMarkers option

`InsertGraphOptions` no longer has the deprecated `allowMarkers` option. `insertGraph()` rejects `#unrelate` and `#delete` markers since 3.8.0, so the option had no effect. Remove it from `insertGraph()` calls.

## typescript: RelateQueryBuilder takes the number query builder

The type parameter of `RelateQueryBuilder` is the number query builder that `relate()` returns, instead of the query builder `relate()` is called on. Custom query builders that override `relate()` with an explicit return type use `RelateQueryBuilder<NumberQueryBuilder<this>>` instead of `RelateQueryBuilder<this>`.

## `insert` and `update` reject field expression keys

[insert](/api/query-builder/mutate-methods.html#insert) and [update](/api/query-builder/mutate-methods.html#update) write whole values, so they throw a [ValidationError](/api/types/#class-validationerror) of type `ModelValidation` for [field expression](/api/types/#type-fieldexpression) keys like `'meta:color'`, which write parts of json columns. 3.x `update` wrote them with `jsonb_set`, and 3.x `insert` passed them to the database as column names. Use [patch](/api/query-builder/mutate-methods.html#patch) for them:

```js
// Before:
await Person.query().update({ name: 'Jennifer', 'meta:color': 'red' }).where('id', 1);

// After:
await Person.query().patch({ name: 'Jennifer', 'meta:color': 'red' }).where('id', 1);
```

Keys with a `:` that the model's [jsonSchema](/api/model/static-properties.html#static-jsonschema) declares in its `properties`, like `'ns:name'`, are normal properties and columns, and `insert` and `update` write them as before. To insert into a column with a `:` in its name, declare it in the schema.

## `snakeCaseMappers` keeps the JSON keys of field expressions

[snakeCaseMappers](/api/objection/#snakecasemappers) only converts the column part of [field expressions](/api/types/#type-fieldexpression) used as property names, and keeps their JSON keys as written: the `preserveJsonKeys` option defaults to `true`. 3.x converted the JSON keys too:

```js
// 4.0: update "persons" set "json_column" = jsonb_set("json_column", '{someKey}', '1', true)
// 3.x: update "persons" set "json_column" = jsonb_set("json_column", '{some_key}', '1', true)
await Person.query().patch({ 'jsonColumn:someKey': 1 });
```

If your JSON columns contain snake_case keys written this way, set `preserveJsonKeys: false` to keep converting them:

```js
class Person extends Model {
  static get columnNameMappers() {
    return snakeCaseMappers({ preserveJsonKeys: false });
  }
}
```

Keys with a `:` that the model's [jsonSchema](/api/model/static-properties.html#static-jsonschema) declares in its `properties` are columns, not field expressions, and are converted as a whole. A column like `ns:foo_bar` is read as `ns:fooBar` and only written back to `ns:foo_bar` if the schema declares `ns:fooBar`. Declare such columns in the schema. [knexSnakeCaseMappers](/api/objection/#knexsnakecasemappers) never converted the JSON keys and is unchanged.

# Migration from objection 2.x to 3.0

This document guides you through each breaking change in objection 3.0 and attempts to provide clear steps to follow. If you find something missing, please open an issue and we'll fix this guide ASAP.

Here's a list of the breaking changes

- [Dropped support for node < 12](#dropped-support-for-node-12)
- [Dropped support for knex < 0.95](#dropped-support-for-knex-0-95)
- [typescript: Methods like `findById` and `findOne` that return a single item are now typed correctly](#typescript-methods-like-findbyid-and-findone-that-return-a-single-item-are-now-typed-correctly)
- [typescript: `QueryBuilder` now inherits `PromiseLike` instead of `Promise`](#typescript-querybuilder-now-inherits-promiselike-instead-of-promise)
- [Dropped a bunch of deprecated methods and features](#dropped-a-bunch-of-deprecated-methods-and-features)

## Dropped support for node < 12

Objection 3.0 needs at least node 12 to work.

## Dropped support for knex < 0.95

Objection needs at least knex 0.95.0 to work.

This is because knex introduced some breaking changes in 0.95.0.

## typescript: Methods like `findById` and `findOne` that return a single item are now typed correctly

In 2.0 methods like `findById`, `findOne` and `first` that return one item or undefined were incorrectly typed
to always return a value. Now the return type of those methods is `SomeModel | undefined`.

You'll get compilation errors in places where you've trusted the old typings. All you need to do is to add a
check for undefined values to narrow down the type or chain the `throwIfNotFound` method that also narrows
down the type back to `SomeModel`.

Before:

```ts
const person = await Person.query().findById(id)
console.log(person.id)
```

After:

```ts
const person = await Person.query().findById(id)

if (!person) {
  throw new Error('Person not found')
}

console.log(person.id)
```

Or

```ts
const person = await Person.query().findById(id).throwIfNotFound()
console.log(person.id)
```

## typescript: `QueryBuilder` now inherits `PromiseLike` instead of `Promise`

In 2.0 and before, the `QueryBuilder` class inherited `Promise` in the typings which made code like this possible

```ts
function findPerson(id: number): Promise<Person> {
  return Person.query().findById(id);
}
```

However, `QueryBuilder` doesn't actually inherit `Promise` but instead is "thenable". Typescript has the type
`PromiseLike` for thenable objects which objection now correctly uses. There are couple of ways to fix the
compilation errors this change causes:

1. Chain `execute` to the query:

```ts
function findPerson(id: number): Promise<Person> {
  return Person.query().findById(id).execute();
}
```

2. Use `PromiseLike`:

```ts
function findPerson(id: number): PromiseLike<Person> {
  return Person.query().findById(id);
}
```

3. Make the functions `async`:

```ts
async function findPerson(id: number): Promise<Person> {
  return Person.query().findById(id);
}
```

## Dropped a bunch of deprecated methods and features

All the methods that were marked deprecated (and printed a deprection message during runtime) in 2.0 have
now been removed.

<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>

# Migration from objection 1.x to 2.0

Objection 2.0 brought a lot of great new features, but the main focus was in cleaning the API, which lead to a bunch of breaking changes. This document guides you through each change and attempts to provide clear steps to follow. If you find something missing, please open an issue and we'll fix this guide ASAP.

Here's a list of the breaking changes

- [Node 6 and 7 are no longer supported](#node-6-and-7-are-no-longer-supported)
- [modify method signature change](#modify-method-signature-change)
- [Bluebird and lodash have been removed](#bluebird-and-lodash-have-been-removed)
- [Database errors now come from db-errors library](#database-errors-now-come-from-the-db-errors-library)
- [#ref references in insertGraph and upsertGraph now require the allowRefs: true option](#ref-references-in-insertgraph-and-upsertgraph-now-require-the-allowrefs-true-option)
- [relate method now always returns the number of affected rows](#relate-method-now-always-returns-the-number-of-affected-rows)
- [\$relatedQuery no longer mutates](#relatedquery-no-longer-mutates)
- [context now acts like mergeContext](#context-now-acts-like-mergecontext)
- [Model.raw and Model.fn now return objection raw and fn](#model-raw-and-model-fn-now-return-objection-raw-and-fn)
- [QueryBuilder.toString and QueryBuilder.toSql have been removed](#querybuilder-tostring-and-querybuilder-tosql-have-been-removed)
- [Rewritten typings](#rewritten-typings)

In addition to these, **a lot** of methods were deprecated and replaced by a new method. The old methods still work, but they print a warning (once per process) when you use them. The warning message tells which method you should be using in the future and you can slowly replace the methods as you get annoyed by the warnings.

Most of the methods have simply been renamed, but in some cases the replacing methods work a little differently. Make sure to read the documentation of the new method.

## Node 6 and 7 are no longer supported

Objection now needs at least node 8 to work.

## `modify` method signature change

Before, you were able to provide multiple modifiers or modifier names to `modify` by providing multiple arguments like this:

```js
Person.query().modify('foo', 'bar');
```

Now only the first argument is used to specify modifiers and all the rest are arguments for the modifiers. The first argument can be an array so you can simply wrap the modifiers in an array if there are more than one of them:

```js
Person.query().modify(['foo', 'bar']);
```

## Bluebird and lodash have been removed

Before, all async operations returned a bluebird promise. Now the bluebird dependency has been dropped and the native `Promise` is used instead. This also means that all bluebird-specific methods

- `map`
- `reduce`
- `reflect`
- `bind`
- `spread`
- `asCallback`
- `nodeify`

have been removed from the `QueryBuilder`.

You need to go through your code and make sure you don't use any bluebird methods or trust that objection returns a bluebird promise.

Objection also used to export `Promise` and `lodash` properties like this:

```js
import { Promise, lodash } from 'objection';
```

which is not true anymore. Both of those exports have been removed.

## Database errors now come from the db-errors library

Before, when a database operation failed, objection simply passed through the native error thrown by the database client. In 2.0 the errors are wrapped using the [db-errors](https://github.com/Vincit/db-errors) library.

The `db-errors` library errors expose a `nativeError` property. If you rely on the properties of the old errors, you can simply change code like this

```js
try {
  await Person.query().where('foo', 'bar')
} catch (err) {
  if (err.code === 13514) {
    ...
  }
}
```

into this:

```js
try {
  await Person.query().where('foo', 'bar')
} catch (err) {
  err = err.nativeError || err

  if (err.code === 13514) {
    ...
  }
}
```

A preferred way to handle this would be to use the new `db-error` classes as described [here](/recipes/error-handling.html#error-handling), but the fastest migration path is to do the above trick.

## #ref references in insertGraph and upsertGraph now require the allowRefs: true option

The usage of `'#ref': 'someId'` and `#ref{someId.someProp}` now requires an explicit `allowRefs: true` option to be passed to the called method:

```js
await Person.query().insertGraph(graphWithRefs, { allowRefs: true });
```

This change was made for security reasons. An attacker could, in theory, use a `#ref{someId.someProperty}` reference to access for example the password hash of a user:

```js
const graphUpsertSentByTheAttacker = {
  user: {
    id: 13431,
    '#id': 'user',
  },

  movie: {
    name: '#ref{user.passwordHash}',
  },
};
```

and then the attacker could just take the password hash out of the movies's name in a client of some sort.

For this attack to work, the attacker must already have an access to the API that modifies the user's information. Additionally and more importantly, the graph described above (and all other graphs I could think of) would only yield the password hash in the movie's name **if the program sets the hash to the graph before the `upsertGraph` call is executed**. This is a highly unlikely scenario and in case of passowords, would require the attacker to be able to access a route that changes the user's password. The reference can never access the property in the database, only in the object itself.

Even though there's very little chance this kind of attack could be carried out at the moment, I'd advice you to never use `upsertGraph` with `{ allowRefs: true }` and unvalidated user input with references!

## relate method now always returns the number of affected rows

`relate` used to return the inserted pivot table row in case of `ManyToManyRelation` and the number of updated rows in case of other relations. Now an integer indicating the number of affected rows is always returned.

You need to go through your code and check how the return values of `relate` queries are used.

## \$relatedQuery no longer mutates

With objection 1.x, doing this

```js
await somePerson.$relatedQuery('pets');
```

added a property `pets` for `somePerson` and saved the result there. This no longer happens with objection 2. Also inserting a new item using

```js
await somePerson.$relatedQuery('pets').insert(pet);
```

would previously add the inserted pet to the `pets` array of `somePerson`. This also no longer happens.

You can use `withGraphFetched` and `fetchGraph` methods if you want to populate the relations. Also, nothing prevents you from doing this:

```js
somePerson.pets = await somePerson.$relatedQuery('pets');
```

You can also use the [`Model.relatedFindQueryMutates`](/api/model/static-properties.html#static-relatedfindquerymutates) and [`Model.relatedInsertQueryMutates`](/api/model/static-properties.html#static-relatedinsertquerymutates) properties to revert back to 1.x behavior.

## context() now acts like mergeContext()

The `context` method of `QueryBuilder` now merges the given object with the current context object instead of replacing it. You can use `clearContext` to clear the context if you need the old behaviour.

## Model.raw and Model.fn now return objection raw and fn

Previously `Model.raw` returned a knex raw builder and `Model.fn` returned a knex `FunctionHelper` instance. In 2.0 objection's [raw](/api/objection/#raw) and [fn](/api/objection/#fn) helpers are returned. To get a knex `raw` builder, you need to use `knex.raw` directly.

## QueryBuilder.toString and QueryBuilder.toSql have been removed

You can use `QueryBuilder.toKnexQuery().toSQL()` instead.

## Rewritten typings

The typings have been completely rewritten in 2.0 and many of the types have changed names. By default you shouldn't get that many errors, but whenever you have explicitly defined an objection type for something other than `Model`, you may need to adjust that type. For example the `QueryBuilder` no longer takes three generic arguments, but two.

For this breaking change we can't easily provide clear migration steps, because we don't know how much you have trusted the typescript type inference, and how much you have used explicit types.

One notable change is that you should no longer define your relations properties using `Partial<Model>` or `Partial<Model>[]`. You can simply use `Model` and `Model[]` and methods like `insertGraph` and `upsertGraph` will just work.
