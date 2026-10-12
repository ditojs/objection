# Join Methods

## joinRelated()

```js
queryBuilder = queryBuilder.joinRelated(relationExpression, opt);
```

Joins a set of relations described by `relationExpression`. See the examples for more info.

##### Arguments

| Argument           | Type                                                      | Description                                       |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| relationExpression | [RelationExpression](/api/types/#type-relationexpression) | An expression describing which relations to join. |
| opt                | object                                                    | Optional options. See the examples.               |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

Join one relation:

```js
await Person.query()
  .joinRelated('pets')
  .where('pets.species', 'dog');
```

Give an alias for a single relation:

```js
await Person.query()
  .joinRelated('pets', { alias: 'p' })
  .where('p.species', 'dog');
```

Join two relations:

```js
await Person.query()
  .joinRelated('[pets, parent]')
  .where('pets.species', 'dog')
  .where('parent.name', 'Arnold');
```

You can also use the [object notation](/api/types/#relationexpression-object-notation)

```js
await Person.query()
  .joinRelated({
    pets: true,
    parent: true
  })
  .where('pets.species', 'dog')
  .where('parent.name', 'Arnold');
```

Join multiple nested relations. Note that when referring to nested relations `:` must be used as a separator instead of `.`. This limitation comes from the way knex parses table references.

```js
await Person.query()
  .select('persons.id', 'parent:parent.name as grandParentName')
  .joinRelated('[pets, parent.[pets, parent]]')
  .where('parent:pets.species', 'dog');
```

Give aliases for a bunch of relations:

```js
await Person.query()
  .select('persons.id', 'pr:pr.name as grandParentName')
  .joinRelated('[pets, parent.[pets, parent]]', {
    aliases: {
      parent: 'pr',
      pets: 'pt'
    }
  })
  .where('pr:pt.species', 'dog');
```

You can also give aliases using the relation expression:

```js
await Person.query()
  .select('persons.id', 'pr:pr.name as grandParentName')
  .joinRelated('[pets as pt, parent as pr.[pets as pt, parent as pr]]')
  .where('pr:pt.species', 'dog');
```

## innerJoinRelated()

Alias for [joinRelated](/api/query-builder/join-methods.html#joinrelated).

## outerJoinRelated()

Outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## leftJoinRelated()

Left join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## leftOuterJoinRelated()

Left outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## rightJoinRelated()

Right join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## rightOuterJoinRelated()

Left outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## fullOuterJoinRelated()

Full outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## modifyJoin()

```js
queryBuilder = queryBuilder.modifyJoin(pathExpression, modifier);
```

Modifies the `ON` clause of the joins that [joinRelated](/api/query-builder/join-methods.html#joinrelated), its variants and [withGraphJoined](/api/query-builder/eager-methods.html#withgraphjoined) create for the relations at `pathExpression`. Conditions on the related table alone can also be expressed with [modifiers](/api/query-builder/other-methods.html#modifiers) or the `modify` of the relation mapping, but conditions that compare the related table with its owner need the `ON` clause.

The `modifier` gets the [knex join clause](https://knexjs.org/guide/query-builder.html#join) and the aliases of the joined tables, which are generated: `pets` for the `pets` relation, `children:pets` for the `pets` of the `children`. `owner` is the alias of the owner table, `related` that of the related table and `joinTable` that of the join table of a `ManyToManyRelation` or `HasOneThroughRelation`. For these, the related table is inner joined to the join table in parentheses, and the modifier gets the `ON` clause of this nested join, so its conditions cover both tables, also in outer joins: `left join (persons_movies as movies_join inner join movies on ...) on ...`. In right and full joins, the nested join is a right or full join too, so the related rows without join table rows are kept like without a modifier. The conditions of the modifier are grouped in parentheses, so an `orOn` can't escape the conditions that join the relation.

The path expression matches the relations by the names they're joined under: the aliases in the relation expression, e.g. `p` for `pets as p`, and for `joinRelated` also the names of its `alias` and `aliases` options. The `aliases` option of `withGraphJoined` only changes the table aliases, so its paths use the relation names.

`modifyJoin` doesn't affect relations fetched with [withGraphFetched](/api/query-builder/eager-methods.html#withgraphfetched), as they aren't joined. Use [modifyGraph](/api/query-builder/eager-methods.html#modifygraph) to filter them.

##### Arguments

| Argument       | Type                                                      | Description                                                                   |
| -------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| pathExpression | [RelationExpression](/api/types/#type-relationexpression) | Expression that specifies the relations whose joins to modify.                |
| modifier       | function(join, { owner, related, joinTable })             | Function that adds conditions to the join clause using `andOn`, `onVal`, etc. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

Join the pets that are younger than their owner, and keep the people without such pets:

```js
const people = await Person.query()
  .select('persons.id', 'pets.name as petName')
  .leftJoinRelated('pets')
  .modifyJoin('pets', (join, { owner, related }) => {
    join.andOn(`${related}.age`, '<', `${owner}.age`);
  });
```

Conditions can also compare columns with values, and use the join table of a many-to-many relation:

```js
const people = await Person.query()
  .withGraphJoined('children.movies')
  .modifyJoin('children.movies', (join, { joinTable }) => {
    join.andOnVal(`${joinTable}.role`, 'lead');
  });
```

## join()

See [knex documentation](https://knexjs.org/guide/query-builder.html#join)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## joinRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#joinraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## innerJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#innerjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## leftJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#leftjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## leftOuterJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#leftouterjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## rightJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#rightjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## rightOuterJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#rightouterjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## outerJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#fullouterjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## fullOuterJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#fullouterjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## crossJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#crossjoin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |
