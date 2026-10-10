# JSON queries

You can use the [ref](/api/objection/#ref) function from the main module to refer to json columns in queries. There is also a bunch of query building methods that have `Json` in their names. Check them out too.

See [FieldExpression](/api/types/#type-fieldexpression) for more information about how to refer to json fields.

Json queries currently only work with postgres. Using json field expressions (`ref('column:path')`, `'column:path'` keys in `patch()` and `update()`) or the `whereJson*()` methods of objection with another database logs a warning, as the generated SQL is Postgres-only. Use the JSON methods of knex instead, like [whereJsonPath()](https://knexjs.org/guide/query-builder.html#wherejsonpath) and [jsonExtract()](https://knexjs.org/guide/query-builder.html#jsonextract). On those databases, `whereJsonSupersetOf(column, value)` and `whereJsonSubsetOf(column, value)` with a plain column and a JSON object or array are passed on to knex, which supports them on MySQL.

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
