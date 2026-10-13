# Migration from objection 3.x to 4.0

This section lists the breaking changes in objection 4.0.

- [objection is an ES module package](#objection-is-an-es-module-package)
- [Dropped support for node < 20.19](#dropped-support-for-node-20-19)
- [Dropped support for knex < 3.3](#dropped-support-for-knex-3-3)
- [Dropped support for TypeScript < 5.8](#dropped-support-for-typescript-5-8)
- [Dropped support for MySQL < 8](#dropped-support-for-mysql-8)
- [Database errors are objection's own classes](#database-errors-are-objection-s-own-classes)
- [Model files given as paths](#model-files-given-as-paths)
- [skipUndefined() is removed](#skipundefined-is-removed)
- [onConflict() with insertGraph() and upsertGraph() throws](#onconflict-with-insertgraph-and-upsertgraph-throws)
- [Relation expressions that name a relation twice throw](#relation-expressions-that-name-a-relation-twice-throw)
- [Unknown graph options throw](#unknown-graph-options-throw)
- [insertGraph() throws for new models below related models](#insertgraph-throws-for-new-models-below-related-models)
- [upsertGraph() sets the foreign key to null before deleting a BelongsToOneRelation row](#upsertgraph-sets-the-foreign-key-to-null-before-deleting-a-belongstoonerelation-row)
- [upsertGraph() keeps the current to-one model for ignored models](#upsertgraph-keeps-the-current-to-one-model-for-ignored-models)
- [offset() in updates and deletes throws](#offset-in-updates-and-deletes-throws)
- [JSON field expressions throw on SQL Server and Oracle](#json-field-expressions-throw-on-sql-server-and-oracle)
- [Casts, json values and json methods on MySQL and SQLite](#casts-json-values-and-json-methods-on-mysql-and-sqlite)
- [Missing and array join properties throw](#missing-and-array-join-properties-throw)
- [upsertGraph() relates moved rows before it deletes](#upsertgraph-relates-moved-rows-before-it-deletes)
- [upsertGraph() upserts below related models in the same graph](#upsertgraph-upserts-below-related-models-in-the-same-graph)
- [insertGraph() and upsertGraph() write in fewer queries](#insertgraph-and-upsertgraph-write-in-fewer-queries)
- [insertGraph() and upsertGraph() reject rows placed in conflicting ways](#insertgraph-and-upsertgraph-reject-rows-placed-in-conflicting-ways)
- [upsertGraph() checks that related models exist](#upsertgraph-checks-that-related-models-exist)
- [insertGraph() and upsertGraph() errors name the index of array input](#insertgraph-and-upsertgraph-errors-name-the-index-of-array-input)
- [`#ref` to new models that the graph doesn't write throws](#ref-to-new-models-that-the-graph-doesn-t-write-throws)
- [insertGraph() and upsertGraph() keep only the referenced branches below noInsert models](#insertgraph-and-upsertgraph-keep-only-the-referenced-branches-below-noinsert-models)
- [typescript: The typings are ES module declarations](#typescript-the-typings-are-es-module-declarations)
- [Static hooks get the result in the shape that the query returns](#static-hooks-get-the-result-in-the-shape-that-the-query-returns)
- [withGraphFetched() assigns what the relation query returns](#withgraphfetched-assigns-what-the-relation-query-returns)
- [`limit`, `offset` and `first` apply per parent in graph modifiers](#limit-offset-and-first-apply-per-parent-in-graph-modifiers)
- [typescript: insertGraph() has no allowMarkers option](#typescript-insertgraph-has-no-allowmarkers-option)
- [typescript: RelateQueryBuilder takes the number query builder](#typescript-relatequerybuilder-takes-the-number-query-builder)
- [typescript: Custom query builders declare RebindType](#typescript-custom-query-builders-declare-rebindtype)
- [typescript: Model.jsonSchema is a readonly schema](#typescript-model-jsonschema-is-a-readonly-schema)
- [typescript: insert(), patch() and update() reject relation data](#typescript-insert-patch-and-update-reject-relation-data)
- [typescript: Queries are checked against the models](#typescript-queries-are-checked-against-the-models)
- [typescript: $relatedQuery() of to-one relations may resolve to undefined](#typescript-relatedquery-of-to-one-relations-may-resolve-to-undefined)
- [Writes of to-one relation queries with returning() resolve to one model](#writes-of-to-one-relation-queries-with-returning-resolve-to-one-model)
- [typescript: toJSON() returns ModelJson](#typescript-tojson-returns-modeljson)
- [typescript: relate().returning() rows are plain objects](#typescript-relate-returning-rows-are-plain-objects)
- [`insert` and `update` reject field expression keys](#insert-and-update-reject-field-expression-keys)
- [`snakeCaseMappers` keeps the JSON keys of field expressions](#snakecasemappers-keeps-the-json-keys-of-field-expressions)
- [Aggregates don't select the columns they're passed](#aggregates-don-t-select-the-columns-they-re-passed)
- [Misplaced `*` and `^` in relation expressions throw](#misplaced-and-in-relation-expressions-throw)
- [`$setRelated` and `$appendRelated` sync foreign keys](#setrelated-and-appendrelated-sync-foreign-keys)
- [findById() and findByIds() keep their id condition in its own group](#findbyid-and-findbyids-keep-their-id-condition-in-its-own-group)
- [JSON in PostgreSQL text columns is no longer parsed](#json-in-postgresql-text-columns-is-no-longer-parsed)

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

## Dropped support for MySQL < 8

Objection 4.0 needs at least MySQL 8.0.17, for window functions, for derived tables that refer to the outer query, and for `JSON_OVERLAPS()` in `whereJsonHasAny()` and `whereJsonHasAll()` and the `MEMBER OF` operator of `BelongsToManyRelation`. MySQL 5.7 reached its end of life in October 2023. 3.x keeps supporting it.

## Many-to-many patches with join table extras run in one query

A many-to-many `patch()` / `update()` with join table extras updates the related rows by their ids in one query, instead of in batches of 500 values as in 3.8.0 and 3.9.0. The ids are bound as one value where the database allows it:

- SQL Server reads them as one JSON value with `openjson`, which needs SQL Server 2016 or newer and a database compatibility level of 130 or higher. SQL Server 2014 reached its end of life in July 2024.
- Binary ids, e.g. `binary(16)` UUIDs, can't be represented in JSON and bind one value per row. On SQL Server, such a patch fails above about 2100 related rows, and on SQLite before 3.32 above 999.
- Composite ids on PostgreSQL bind one value per column, which fails above 65535 values, about 32,000 related rows with two-column ids.

Run such patches on fewer related rows at once, e.g. by filtering them in several queries in a transaction. 3.x keeps the batches.

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

## upsertGraph() sets the foreign key to null before deleting a BelongsToOneRelation row

When `upsertGraph()` deletes the related row of a `BelongsToOneRelation` because of `pet: null` or `#delete`, it first sets the owner's foreign key to `null`, like `unrelate()`, whatever the owner's `jsonSchema` says. 3.9 only did this when the schema allowed `null` for the key, and otherwise deleted the row first and left the owner's reference to the database. Now an owner whose schema doesn't allow `null`, like `{ type: 'integer' }`, fails with a `ValidationError`, and a `NOT NULL` column fails with a database error, where `ON DELETE CASCADE` deleted the owner and `ON DELETE SET NULL` cleared the reference. Allow `null` in the schema and the column, or delete the owner itself if it can't exist without the related row.

## upsertGraph() keeps the current to-one model for ignored models

In a `HasOneRelation` or `HasOneThroughRelation`, `upsertGraph()` keeps the current model when the graph only holds a model that it ignores: a model marked with `#unrelate` or `#delete` that isn't the current one, or a replacement that `noInsert` or `noRelate` skips. The relation is left as if it wasn't in the graph, as for `BelongsToOneRelation` since 3.9. 3.x deleted or unrelated the current model. To remove the current model, mark it with its own id, like `{ pet: { id: 1, '#delete': true } }`, or pass `pet: null`. To-many relations are unchanged: an array is the full list, so `pets: [{ id: 2, '#delete': true }]` still removes the current pets.

## offset() in updates and deletes throws

`update()`, `patch()` and `delete()` throw an error for `offset()` when the query is executed. knex leaves the offset out of these statements, and on SQL Server the limit too, so they modified other rows than the offset asked for. 3.9 logged a warning. On MySQL, `delete()` also throws for `orderBy()` together with `limit()`, as knex leaves out the order but keeps the limit, so the limit deleted rows in any order. Fetch the ids of the rows to modify in a separate query and filter by them with `whereIn()`, or drop the offset if it was never applied. A many-to-many `patch()` / `update()` with join table extras on MySQL and SQL Server already selects the related rows first, so it honours the offset and doesn't throw.

## JSON field expressions throw on SQL Server and Oracle

JSON field expressions like `ref('column:path')` and `'column:path'` keys in `patch()`, `ref('column').castJson()` and the `whereJson*()` methods of objection throw an error on SQL Server and Oracle. 3.x generated the SQL of PostgreSQL, which these databases reject, and logged a warning. Use the JSON methods of knex instead, like `whereJsonPath()` and `jsonExtract()`. Other databases than PostgreSQL, MySQL and SQLite still get a warning.

On MySQL and SQLite, objection writes the SQL of the database for json field expressions and the `whereJson*()` methods, where 3.x generated the SQL of PostgreSQL, which they reject or, worse, run with other results, e.g. MySQL reads the `#>` operator as the start of a comment. SQLite has no json containment, so `whereJsonSupersetOf()` and `whereJsonSubsetOf()` throw an error there.

## Casts, json values and json methods on MySQL and SQLite

The casts of `ref()` and `val()` use the types of MySQL there, as `CAST()` on MySQL only accepts a few types. `castText()`, `castInt()`, `castBigInt()` and `castBool()` were rejected by MySQL before and are `CHAR` and `SIGNED` now. These change their results:

- `castFloat()` is `DOUBLE` instead of `FLOAT`, and `castReal()` is `FLOAT` instead of `DOUBLE`, like `float` and `real` on PostgreSQL. Use `castTo('FLOAT')` or `castTo('DOUBLE')` for the previous types.
- `castDecimal()` is `DECIMAL(65,30)` instead of `DECIMAL`, which rounds to integers. Use `castTo('DECIMAL(10,2)')` or similar for a fixed precision.
- Casts of json values in field expressions turn json `null` into `NULL`, like on PostgreSQL and SQLite, instead of `0` or `'null'`.

On MySQL and SQLite, `val()` with an object or array and `val().castJson()` are json values, `CAST(? AS JSON)` on MySQL and `json(?)` on SQLite, so they compare as json. Before, they were json text, which MySQL compared as a string. Pass `JSON.stringify(value)` to compare with json text.

On SQLite, `ref('column').castJson()` throws for a whole column, as SQLite can't tell json columns from text columns. Cast the column first, e.g. `ref('name').castText().castJson()`, or refer to a json path.

## Missing and array join properties throw

Fetching relations with `withGraphFetched()`, `$fetchGraph()`, `fetchGraph()` or `$relatedQuery()` throws an error in these cases, where 3.x logged a warning and returned no related models:

- Owner models loaded from the database are missing a join property, e.g. because a partial `select()` left out the id. Select the column in the owner query. Owner models built in memory, e.g. with `fromJson()`, may not have their keys yet and still find no related models, now without a warning. This includes the foreign key of a `BelongsToOneRelation`, which 3.x didn't report. Models returned by `insert()` count as built in memory, also with `returning()`.
- Related models come back without their join property, e.g. because the relation mapping uses column names that `knexSnakeCaseMappers()` maps to other property names. Use the property names of the models in the relation mapping.
- An owner join property holds an array of keys, e.g. a JSON array column. Use a `BelongsToManyRelation` instead, or a `ManyToManyRelation` through a join table. `$relatedQuery()` without `withGraphFetched()` or `$fetchGraph()` keeps working for them.

## upsertGraph() relates moved rows before it deletes

`upsertGraph()` relates the rows that move to existing owners of a `HasManyRelation` or `HasOneRelation` first, before it deletes or unrelates the rows that the graph removes. 3.x deleted first, so a row that moved out of a deleted parent was deleted with it by `ON DELETE CASCADE`, and failed with a foreign key without `ON DELETE` action. The update hooks of these relates now run before the delete hooks of the same call. Rows that wait for the keys or references of models that the graph inserts, e.g. a name from a `#ref{}` to an inserted model, are related after the inserts, as in 3.x, so the relate throws a `NotFoundError` when `ON DELETE CASCADE` deleted the row with its old parent.

A row related from another owner can no longer take the unique key of a row that the graph removes in its new place, e.g. with `unique(ownerId, name)`: the relate fails with a `UniqueViolationError`. Delete the conflicting row with a separate query in the same transaction first. Replacing such a row by a new one, or renaming a kept row to its key, still works, as do relates into a `HasOneRelation` with a unique foreign key.

## upsertGraph() upserts below related models in the same graph

3.x upserted the models below a related model with a nested `upsertGraph()` call for each owner and relation, after all other writes of the graph. 4.0 fetches the rows of the related models with their relations together with the rest of the graph, and writes them in the same steps, so their deletes, inserts and patches run with the others of their kind instead of last. The options keep matching the full relation paths.

A related model with relations whose row doesn't exist throws a `NotFoundError` saying that the model doesn't exist, before anything is written. 3.x wrote the rest of the graph first and then failed in the nested call, or with a foreign key error.

Rows that the graph relates into a `HasManyRelation` or `HasOneRelation` from another owner are the exception: their relations change with the move, e.g. the `owner` of a pet that moves to another person, so the models below them are upserted in a pass of their own, after the rest of the graph, against their rows as they are after the move, like 3.x did. Errors about the models below them, like a model that isn't a child and isn't related, are thrown after the rest of the graph is written, so without a transaction the rest of the graph stays written: run `upsertGraph()` in a transaction. A row is written once for the move and once more if the models below it change its keys. A `#ref` from the rest of the graph can point to such models only if they have ids, and a `#ref{}` not at all, as they're written after it.

## insertGraph() and upsertGraph() reject rows placed in conflicting ways

A graph that gives one row two different values for the same column, or the slot of a `HasOneRelation` two different rows, throws a `ValidationError` of type `InvalidGraph` that names both data paths, before anything is written. A row is identified by its table and id, and a `#ref` or `#dbRef` model is a place of the row that it refers to. For example:

- the row is placed under two owners through the same foreign key, e.g. a pet in the `pets` of two people, also through `#ref`;
- the row is placed under an owner through a `HasManyRelation` or `HasOneRelation`, and its own `BelongsToOneRelation` names another model, e.g. `{ id: 1, pets: [{ id: 4, owner: { name: 'new' } }] }` or a child with another `parent`;
- one place gives the row a foreign key prop that another place sets through a relation, e.g. `[{ id: 1, children: [{ id: 2 }] }, { id: 2, parentId: 5 }]`;
- the row appears twice with different values for the same prop;
- two places give the same `HasOneRelation` of an owner two different rows, or one row and `null`, also when one of the rows gets the owner's key through a foreign key prop or its own `BelongsToOneRelation`, e.g. `{ id: 1, profile: null }` next to `{ id: 6, person: { id: 1 } }`. A `HasOneRelation` with a `filter` only counts the rows placed through it;
- the row is marked with `#delete` in one place and kept in another, or marked with `#unrelate`, which clears its key, while another place puts it under an owner;
- a model is related twice through a many-to-many relation with different join table extras, e.g. `{ id: 1, movies: [{ id: 2, role: 'director' }, { id: 2, role: 'producer' }] }`. A pair of models has one join row, as in 3.x, which wrote the last extras to it. To relate a pair more than once, model the join table with an id column of its own and relate its rows instead, e.g. as a `credits` relation from the person to a `Credit` model that belongs to the movie.

3.x wrote these graphs in an order that the graph doesn't define, and often deleted rows that the graph names, like the root. A graph that places a row the same way more than once stays valid, e.g. `{ id: 1, pets: [{ id: 4, owner: { id: 1 } }] }`, and so does a row in places that write different columns, e.g. as a `child` and as a `boss`. A foreign key prop that a model gives next to its own relation, e.g. an old `parentId` next to a new `parent`, still follows the relation. A row that one place of an owner lists and another place of the same owner leaves out is kept, as the graph keeps it in the first place.

## upsertGraph() checks that related models exist

`upsertGraph()` fetches the ids of the models that it relates, with `relate` or through `#dbRef`, and throws a `NotFoundError` before anything is written if one of them doesn't exist and the graph doesn't insert it elsewhere, e.g. with `insertMissing`:

```js
await Person.query().upsertGraph({ id: 1, pets: [{ id: 1 }, { id: 99 }] }, { relate: true });
// NotFoundError: model (id=99) does not exist. If you want to insert it with an id, use the insertMissing option
```

3.x only checked the related models that the graph gave relations of their own. For the others, it patched no row for a `HasManyRelation` or `HasOneRelation`, and wrote the foreign key or the join row of the missing model for a `BelongsToOneRelation` or `ManyToManyRelation`. Code that relied on these keys to missing rows, e.g. without foreign key constraints, needs to insert the rows first, or use `insertMissing`. `#ref` models are the models they refer to, and are only fetched when they have relations.

## insertGraph() and upsertGraph() errors name the index of array input

The data paths of models in array input start with their index in the array. This applies to the keys of the `data` of a `ValidationError`, the `dataPath` of a `NotFoundError`, and the `dataPath` option that a custom `Validator` gets. In 3.x, all models of the array had the same paths, so the path didn't tell which one failed:

```js
await Person.query().insertGraph([{ firstName: 'Jennifer' }, { pets: [{ name: 1 }] }]);
// 3.x: err.data['pets[0].name']
// 4.0: err.data['[1].pets[0].name']
```

`NotFoundError`s give `dataPath: [1, 'pets', 0]` instead of `['pets', 0]`, and validators get `'[1].pets[0]'` instead of `'.pets[0]'`. Graphs of a single object keep their paths.

## `#ref` to new models that the graph doesn't write throws

A `#ref` to a new model, or a `#ref{}` to the id of a new model, that the graph doesn't write throws a `ValidationError` of type `InvalidGraph` before anything is written, e.g. for a model that `noInsert` skips, or below a model that `noRelate` ignores or that is marked with `#delete` or `#unrelate`. For references of models below rows that `upsertGraph()` moves into a `HasManyRelation` or `HasOneRelation`, it's thrown once the rest of the graph is written, before these models are. Point the reference to a model that the graph writes, or give the referenced model its id. Other `#ref{}` read the models as the graph gives them, also in branches that the graph doesn't write. In 3.x, a `#ref` into a branch that `noRelate`, `#delete` or `#unrelate` leave out failed with an error, sometimes after writing, and a `#ref{}` into such a branch wrote the `#ref{}` text itself, also for ids. A plain `#ref` to a model that `noInsert` skipped silently wrote `null`, and a `#ref{}` to its id wrote `null`, or failed after writing in a key that the relation sets too. See [the guide](/guide/query-examples.md#graph-inserts) for the rule.

## insertGraph() and upsertGraph() keep only the referenced branches below noInsert models

Below a model that `noInsert` skips, nothing is written, except for the branches that a `#ref` or `#ref{}` of a written model points into, directly or through other kept branches. In 3.9.0, one such reference kept the whole branch of the skipped model, with all its other related models.

An existing row that the graph only places below a skipped model, in a branch that no reference keeps, isn't kept there anymore. If its owner elsewhere in the graph leaves it out, it's removed there, like any row that the graph doesn't keep:

```js
// Person 1 has pet 2.
await Org.query().upsertGraph(
  {
    id: 1,
    people: [
      { id: 1, pets: [] },
      { id: 2, favoritePet: { '#ref': 'cat' } },
      // Skipped by `noInsert`, but `cat` is referenced:
      { name: 'new', pets: [{ id: 2 }, { '#id': 'cat', name: 'Cat' }] },
    ],
  },
  { relate: true, noInsert: ['people'], allowRefs: true },
);
// 3.9.0: pet 2 is kept, as the reference to `cat` kept the whole branch.
// 4.0: pet 2 is deleted, as only the branch of `cat` is kept.
```

To keep such a row, place it where the graph writes it, or use `noDelete` for its owner's relation.

## insertGraph() and upsertGraph() write in fewer queries

Rows that the graph deletes are deleted with one query per relation instead of one per owner, so the static `beforeDelete` and `afterDelete` hooks run once with all owners as `items`. Join rows and unrelated rows are still removed per owner.

## typescript: The typings are ES module declarations

The typings no longer use `export =`. They declare the named exports of the ES module they describe. Apart from the default import, ES module and bundler projects need no changes.

TypeScript projects that compile to CommonJS can `require()` objection with `"module": "nodenext"`. With `"module": "node16"`, TypeScript refuses to `require()` objection from CommonJS files. On TypeScript < 7, projects that use `"module": "commonjs"` with the old `"moduleResolution": "node"` keep working. TypeScript 7 removed that resolution mode, so CommonJS projects need `"module": "nodenext"` there.

## Static hooks get the result in the shape that the query returns

The `result` of the static `after*` hooks is what the query returns, instead of an array that wraps it:

- `afterFind` gets the model of `first()`, `findById()` and queries for to-one relations like `pet.$relatedQuery('owner')`, or `undefined` if nothing is found. With `page()` and `range()`, it still gets the array of models.
- `afterInsert` gets the inserted model when a single model is inserted, and runs after the fetch of `insertAndFetch()`, with the fetched values.
- `afterUpdate` and `afterDelete` get the number of updated or deleted rows. With `patchAndFetchById()`, `patchAndFetch()` and their `update*` variants, `afterUpdate` runs after the fetch and gets the fetched model, or `undefined` if nothing was updated.
- In `before*` hooks, `result` is `undefined` instead of `[]`.

Code like `result.map(...)`, `result[0]` or `result.length` fails for single models, numbers and `undefined`. Use `asArray()` to get an array in all cases:

```js
import { Model, asArray } from 'objection';

class Person extends Model {
  static afterFind({ result }) {
    for (const person of asArray(result)) {
      // ...
    }
  }
}
```

The static `after*` hooks run as the last step of the query, after `first()`, `page()`'s models and the fetches of the `*AndFetch()` methods, but before the `runAfter()` callbacks, including the ones in `context()`, `throwIfNotFound()` and `traverse()`. These callbacks now get the result in the shape that the query returns and after the hooks, e.g. the model with `first()` also if `runAfter()` is called before `first()`, and they run before `page()` and `range()` wrap the result in `{ results, total }`.

The outer queries of `upsertGraph()` and `upsertGraphAndFetch()` no longer call the static `beforeFind` and `afterFind` hooks of the root model class with the input models. The queries that run for the models of the graph and their relations call the hooks as before. Likewise, `fetchGraph()` / `$fetchGraph()` and the relations that `skipFetched` skips no longer call the static `beforeFind` hook of the models they already have, as they didn't call `afterFind`: the find hooks are only called for queries that run.

TypeScript: `StaticHookArguments<M, R>` declares `result: R`, with `R = undefined` by default, and the static hooks of `Model` declare the shapes that they get, e.g. `StaticHookArguments<any, Model | Model[] | undefined>` for `afterFind`. Overrides that destructure `result` from `StaticHookArguments<Person>` need the type of the result as second type argument, e.g. `StaticHookArguments<Person, Person | Person[] | undefined>`.

## withGraphFetched() assigns what the relation query returns

`withGraphFetched()` assigns what a relation query returns to the owners, after the static `afterFind` hook of the related model class and the `runAfter()` callbacks of the relation query, e.g. in modifiers or `modifyGraph()`. 3.x assigned the related models before both and ignored their return values. Related models that they filter out are no longer assigned, and the order that they return is kept. They can only return the related models that the query found. Other objects, e.g. copies like `result.map((pet) => ({ ...pet }))` or a count, throw an error. Change the models in place instead, or transform them in `runAfter()` of the root query.

`withGraphJoined()` now calls the static `afterFind` hooks of the joined related model classes too, and assigns what they return in the same way. The relations have no query of their own, so `asFindQuery()` and `cancelQuery()` throw an error in these hooks. `afterFind` hooks that call them fail for joined relations. `beforeFind` isn't called for joined relations.

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

The relation query becomes a subquery, and its order moves into a `row_number()` window function. The order can only refer to the related table's columns that are selected and to the aliases of the result columns, see [limiting related items per parent](/api/query-builder/eager-methods.html#limiting-related-items-per-parent).

To keep the behaviour of 3.x, set `limitPerParent: false` in the graph options, or in [defaultGraphOptions](/api/model/static-properties.html#static-defaultgraphoptions) for all queries of a model.

## typescript: insertGraph() has no allowMarkers option

`InsertGraphOptions` no longer has the deprecated `allowMarkers` option. `insertGraph()` rejects `#unrelate` and `#delete` markers since 3.8.0, so the option had no effect. Remove it from `insertGraph()` calls.

## typescript: RelateQueryBuilder takes the number query builder

The type parameter of `RelateQueryBuilder` is the number query builder that `relate()` returns, instead of the query builder `relate()` is called on. Custom query builders that override `relate()` with an explicit return type use `RelateQueryBuilder<NumberQueryBuilder<this>>` instead of `RelateQueryBuilder<this>`.

## typescript: Custom query builders declare RebindType

Custom query builders declare one `RebindType` member, from which the query builder types of `first()`, `findById()`, `patch()`, `page()` and the other methods that change the result type are derived. The five `*QueryBuilderType` members of 3.x are removed. Replace them:

```ts
// 3.x
class MyQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare ArrayQueryBuilderType: MyQueryBuilder<M, M[]>;
  declare SingleQueryBuilderType: MyQueryBuilder<M, M>;
  declare MaybeSingleQueryBuilderType: MyQueryBuilder<M, M | undefined>;
  declare NumberQueryBuilderType: MyQueryBuilder<M, number>;
  declare PageQueryBuilderType: MyQueryBuilder<M, Page<M>>;
}

// 4.0
class MyQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare RebindType: MyQueryBuilder<this['~M'], this['~R']>;
}
```

The helper types `SingleQueryBuilder`, `MaybeSingleQueryBuilder`, `ArrayQueryBuilder`, `NumberQueryBuilder` and `PageQueryBuilder` take any query builder, e.g. `MaybeSingleQueryBuilder<this>` as the return type of an overridden `findById()`, and `NumberQueryBuilder<MaybeSingleQueryBuilder<this>>` for `patchById()`, `updateById()` and `deleteById()`, the writes of `findById()`. `WithGraphModelQueryBuilder<M, E>` is removed. Use `QueryBuilderType<WithGraphModel<M, E>>` instead. The `ReturningMethod` interface is removed too, `returning()` is a method of `QueryBuilder`. On query builders with an `any` result, e.g. `AnyQueryBuilder`, it returns `QueryBuilder<any, any> | QueryBuilder<any, any[]>` instead of `QueryBuilder<any, any[]>`.

## typescript: Model.jsonSchema is a readonly schema

`static jsonSchema` is typed `ReadonlyJSONSchema`, a JSON schema with readonly arrays, so that schemas declared `as const` can be assigned to it, for `FromSchema`. A `JSONSchema` is assignable to it, but not the other way around: a model's schema read through the static type can't be passed to a parameter typed `JSONSchema`, or returned from `$beforeValidate()`. Declare the type on models that are used that way:

```ts
import { JSONSchema, Model } from 'objection';

class Person extends Model {
  static jsonSchema: JSONSchema = {
    type: 'object',
    required: ['firstName'],
    properties: { firstName: { type: 'string' } }
  };
}

function describeSchema(schema: JSONSchema) {
  // ...
}

describeSchema(Person.jsonSchema);
```

Code that reads the schema of any model class, e.g. `modelClass.jsonSchema` in plugins or helpers, takes it as `ReadonlyJSONSchema`.

## typescript: insert(), patch() and update() reject relation data

`insert()`, `patch()`, `update()` and their variants, `merge()` and `relate()` only write the columns of the model's own table and ignore relation properties. Their argument type is `PartialModelRow<M>`: a model instance, or the model's properties without relations. Objects with relation data are type errors, and so are values whose type includes the relation properties, even if they hold no relation data: `Partial<Person>`, `ModelObject<Person>` (e.g. the result of `toJSON()`) and `PartialModelObject<Person>`, which these methods took in 3.x. Type such values as `PartialModelRow<Person>`, or pass the model instance:

```ts
// 3.x: accepted, and `pets` silently ignored
await Person.query().insert({ firstName: 'Jennifer', pets: [{ name: 'Fluffy' }] });

// 4.0: insertGraph() inserts the relations
await Person.query().insertGraph({ firstName: 'Jennifer', pets: [{ name: 'Fluffy' }] });

// 4.0: type data without relations as PartialModelRow
function insertPerson(data: PartialModelRow<Person>) {
  return Person.query().insert(data);
}
```

Custom query builders that override these methods use `PartialModelRow<M>` for the data instead of `PartialModelObject<M>`, and `PartialModelPatch<M>` for `patch()`, its variants and `merge()`, which also takes field expression keys like `'address:street'`.

## typescript: Queries are checked against the models

The typings check the column names and values of queries against the models: `where('firstNme', …)`, `where('age', 'thirty')` or `withGraphFetched('petz')` are type errors. See [Checking queries in TypeScript](/guide/models.html#checking-queries-in-typescript) for the rules. Code that the checks reject:

- Column names in variables typed `string`: pass them with `ref(column)`, or type them as a union of the model's columns.
- Columns of other queries, e.g. of an outer query in a subquery, and aliases of selections in `groupBy()` or `having()`: use `ref('persons.id')`.
- Properties of results that a `select()` leaves out: they aren't in the result type anymore. Select them, or select `*`.
- Columns that the model doesn't declare as properties: declare them, or use `ref()` / `raw()`.
- Column methods after `withGraphFetched()` / `withGraphJoined()` on a generic query builder, e.g. `this.$query().withGraphFetched('pets').where('id', this.id)` in a model method: TypeScript resolves the narrowed query builder to a union there, which only takes `ref()` / `raw()` columns, e.g. `where(ref('id'), this.id)`.
- Models with `snakeCaseMappers()`: declare `ColumnNameMapping: 'snakeCase'` on the model, so that the snake case names in queries are checked, see [Snake case to camel case conversion](/recipes/snake-case-to-camel-case-conversion.html).

`ModelObject`, `PartialModelObject` and the other property types leave out properties starting with `$`, which objection treats as internal, like `toJSON()` does. Properties like `$app` declared on models aren't columns either.

To keep the typings of 3.x, opt out of the checks:

```ts
declare module 'objection' {
  interface TypeConfig {
    strict: false;
  }
}
```

## typescript: $relatedQuery() of to-one relations may resolve to undefined

`$relatedQuery()` of a `BelongsToOneRelation`, `HasOneRelation` or `HasOneThroughRelation` resolves to `undefined` when there is no related row, and its type says so now:

```ts
const parent = await person.$relatedQuery('parent'); // Person | undefined

// Throw instead, if the row has to exist:
const parent = await person.$relatedQuery('parent').throwIfNotFound(); // Person
```

## Writes of to-one relation queries with returning() resolve to one model

`patch()`, `update()` and `delete()` with [returning](/api/query-builder/find-methods.html#returning) through `$relatedQuery()` of a `BelongsToOneRelation`, `HasOneRelation` or `HasOneThroughRelation` resolve to the written model, or `undefined` if there is no related row, like the find query does: only several written rows, which a has-one relation can have, stay an array. 3.x resolved to an array. The `result` of the static `afterUpdate()` and `afterDelete()` hooks of these writes is the model too. `relatedQuery()` with `for()` still resolves to an array:

```js
// Before:
const [parent] = await person.$relatedQuery('parent').patch({ age: 50 }).returning('*');

// After:
const parent = await person.$relatedQuery('parent').patch({ age: 50 }).returning('*');
```

The typings give writes with `returning()` the result kind of their query everywhere: one model, or `undefined`, after `$query()`, `findById()`, `first()`, the `*ById()` methods and `$relatedQuery()` of to-one relations, also with `returning()` before the write, and an array otherwise. They typed writes of `findById()`, `first()` and the `*ById()` methods as arrays, although they resolve to one model too. Custom query builders that override `patchById()`, `updateById()` or `deleteById()` declare `NumberQueryBuilder<MaybeSingleQueryBuilder<this>>` as their return type, see [Custom query builders declare RebindType](#typescript-custom-query-builders-declare-rebindtype).

## typescript: toJSON() returns ModelJson

`toJSON()` and `$toJson()` return `ModelJson<M>`, which describes the plain object they produce: the model's properties without methods, and the related models as `ModelJson` too. They returned `ModelObject<M>`, whose relations claimed model instances. Type the values that hold the result of `toJSON()` as `ModelJson<M>` instead of `ModelObject<M>`:

```ts
function send(person: ModelJson<Person>) {
  // ...
}

send(person.toJSON());
```

## typescript: relate().returning() rows are plain objects

The rows of `relate().returning()` are typed `Pojo[]` instead of `any[]`: depending on the relation, they are the join rows, the related rows or the owner rows, but not models of the query. Cast them to the rows you expect:

```ts
const rows = await person.$relatedQuery('movies').relate(50).returning('*');
const joinRows = rows as { personId: number; movieId: number }[];
```

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

## Aggregates don't select the columns they're passed

Aggregates like `count()` and `sum()` select their aliases, not the columns they're passed, but they still replace the select all of a query. When a query with aggregates loads relations with `withGraphFetched()` or `withGraphJoined()`, objection selects the columns it needs to assign the related models. 3.x treated `count('* as n')` as selecting all columns and `count('ownerId')` as selecting `ownerId`, so these columns were missing and the relations came back empty:

```js
// 4.0: select count(*) as "n", "pets"."ownerId" from "pets" group by "ownerId"
// 3.x: select count(*) as "n" from "pets" group by "ownerId", and every owner is null
await Pet.query().count('* as n').groupBy('ownerId').withGraphFetched('owner');
```

Grouped queries need to group by the added columns too, or the database rejects them. Add the join columns to `groupBy()`, like `groupBy('ownerId')` above. In `withGraphJoined()`, the root query selects only its id columns next to the aggregates instead of all its columns. Select the columns you need explicitly.

## Misplaced `*` and `^` in relation expressions throw

`*` and `^` end a relation path. 3.x silently ignored everything after them, so `'parent.^.pets'` fetched `parent` recursively without `pets`, and `'*.pets'` fetched all relations. It also ignored modifiers and aliases on them, like `'parent.^(onlyAdults)'`, and treated `*` and `^` in a list, like `'[children, *]'`, as relation names. These expressions throw an error in 4.0, in all methods that take relation expressions and in the graph options of `insertGraph()` and `upsertGraph()`. Remove what follows `*` or `^`, and apply modifiers to the relation itself, like `'parent(onlyAdults).^'`.

## `$setRelated` and `$appendRelated` sync foreign keys

[\$setRelated](/api/model/instance-methods.html#setrelated) and [\$appendRelated](/api/model/instance-methods.html#appendrelated) set the foreign keys to match the relation. 3.x only assigned the related models:

```js
post.$setRelated('author', user); // post.authorId === user.id
post.$setRelated('author', null); // post.authorId === null

user.$setRelated('posts', [post1, post2]); // post1.authorId === post2.authorId === user.id
user.$setRelated('posts', [post2]); // post1.authorId === null, unless it already pointed to another user
new User().$setRelated('posts', [post3]); // post3.authorId === null, as the user has no id yet
```

The synced keys show up in `toJSON()` and are written by a later `patch()`, `update()` or `upsertGraph()` of these models. Code that assigned related models only to serialize them, and relied on their foreign keys staying as they were, can assign the relation property directly, e.g. `post.author = user`.

## findById() and findByIds() keep their id condition in its own group

[findById](/api/query-builder/find-methods.html#findbyid) and [findByIds](/api/query-builder/find-methods.html#findbyids) put their id condition in its own parentheses, like `$query()` and `patchById()`, `updateById()` and `deleteById()` already do. 3.x added it to the other `where` clauses of the query, so an `orWhere()` widened it:

```js
// 4.0: where "persons"."id" = 1 and ("slug" = 'jennifer')
// 3.x: where "persons"."id" = 1 or "slug" = 'jennifer'
await Person.query().findById(1).orWhere('slug', 'jennifer');
```

Queries that relied on this, like a lookup by id or slug, need to spell out both conditions:

```js
await Person.query().where('id', idOrSlug).orWhere('slug', idOrSlug).first();
```

## JSON in PostgreSQL text columns is no longer parsed

The PostgreSQL drivers return `json` and `jsonb` columns parsed. 3.x parsed every string that came out of them a second time, so a JSON attribute that holds the string `'123'` came back as the number `123`, and saving the model wrote the change back. 4.0 keeps the values that these drivers return, so JSON stored in `text` columns comes back as a string. Change these columns to `jsonb`:

```sql
ALTER TABLE persons ALTER COLUMN address TYPE jsonb USING address::jsonb;
```

Or tell objection that the model's JSON columns hold text, which it then parses strictly, throwing for invalid JSON:

```js
class Person extends Model {
  static jsonColumnFormat = 'text';
}
```

Other drivers parse JSON attributes as in 3.x. On MariaDB, which stores JSON as `LONGTEXT`, `jsonColumnFormat = 'text'` avoids guessing whether a string is JSON.

Overrides of the static [fromDatabaseJson](/api/model/static-methods.html#static-fromdatabasejson), [\$setDatabaseJson](/api/model/instance-methods.html#setdatabasejson) and [\$parseDatabaseJson](/api/model/instance-methods.html#parsedatabasejson) get the query's `options` as second argument. Pass them on to `super`, or JSON attributes are parsed as in 3.x.

<br>
<br>

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
