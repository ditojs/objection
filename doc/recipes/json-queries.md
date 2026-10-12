# JSON queries

You can use the [ref](/api/objection/#ref) function from the main module to refer to json columns in queries. There is also a bunch of query building methods that have `Json` in their names. Check them out too.

See [FieldExpression](/api/types/#type-fieldexpression) for more information about how to refer to json fields.

Json field expressions in `ref()` and `'column:path'` keys in `patch()` and `merge()` work on PostgreSQL, MySQL and SQLite: objection writes the SQL of each database, e.g. `"column"#>'{a,b}'` on PostgreSQL, ``JSON_EXTRACT(`column`, '$."a"."b"')`` on MySQL and ``json_extract(`column`, '$."a"."b"')`` on SQLite, and `jsonb_set()`, `JSON_SET()` and `json_set()` for patches. The `whereJson*()` methods of objection only work on PostgreSQL so far, and throw an error on MySQL and SQLite. On MySQL, `whereJsonSupersetOf(column, value)` and `whereJsonSubsetOf(column, value)` with a plain column and a JSON object or array are passed on to knex, which supports them there. On SQL Server and Oracle, json field expressions throw an error, and on other databases they log a warning and use the SQL of PostgreSQL. Use the JSON methods of knex there, like [whereJsonPath()](https://knexjs.org/guide/query-builder.html#wherejsonpath) and [jsonExtract()](https://knexjs.org/guide/query-builder.html#jsonextract).

The databases differ in a few ways:

- On PostgreSQL, `column:1` and `column:[1]` both refer to an array element or an object key. On MySQL and SQLite, `[1]` only refers to array elements and `.1` only to object keys.
- Without a cast, a reference is a json value on PostgreSQL and MySQL and the plain SQL value on SQLite, where objects and arrays are json text. The `mysql` driver returns json values as json text, `mysql2` and `pg` parse them.
- The casts use the types of the database, e.g. `castInt()` is `SIGNED` on MySQL, see [ReferenceBuilder](/api/types/#class-referencebuilder).
- SQLite can't tell json columns from text columns, so `ref('column').castJson()` throws there for a whole column. Cast it first, e.g. `ref('name').castText().castJson()`, or refer to a json path.
- Patching a path whose parent object is missing leaves the json unchanged on PostgreSQL and MySQL, while SQLite creates the parent objects. Patching an array index after the end appends to the array on PostgreSQL and MySQL, and leaves it unchanged on SQLite.
- MySQL assigns the columns of an update from left to right, so `patch({ name: 'a', 'json:name': ref('name') })` writes the new name into the json column there.
- On SQLite, a `ref()` to a whole json column or a subquery that selects one, as the value of a `'column:path'` key, is written as a json string, as SQLite can't tell json columns from text columns. Write `raw('json(??)', ['column'])` to write the json value.

```js
import { ref } from 'objection';

await Person.query()
  .select([
    'id',
    ref('jsonColumn:details.name')
      .castText()
      .as('name'),
    ref('jsonColumn:details.age')
      .castInt()
      .as('age')
  ])
  .join(
    'animals',
    ref('persons.jsonColumn:details.name').castText(),
    '=',
    ref('animals.name')
  )
  .where('age', '>', ref('animals.jsonData:details.ageLimit'));
```

Individual json fields can be updated like this:

```js
await Person.query().patch({
  'jsonColumn:details.name': 'Jennifer',
  'jsonColumn:details.age': 29
});
```

`withGraphJoined` and `joinRelated` methods also use `:` as a separator which can lead to ambiquous queries when combined with json references. For example:

```
jsonColumn:details.name
```

Can mean two things:

1. column `name` of the relation `jsonColumn.details`
2. field `name` of the `details` object inside `jsonColumn` column

When used with `withGraphJoined` and `joinRelated` you can use the `from` method of the `ReferenceBuilder` to specify the table:

```js
await Person.query()
  .withGraphJoined('children.children')
  .where(ref('jsonColumn:details.name').from('children:children'), 'Jennifer');
```
