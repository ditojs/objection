# Relations

We already went through how to create relationships (aka. relations, associations) in the [models](/guide/models.html) section's examples but here's a list of all the available relation types in a nicely searchable place. See [this](/api/types/#type-relationmapping) API doc section for full documentation of the relation mapping parameters.

Relationships are a very basic concept in relational databases and if you aren't familiar with it, you should spend some time googling it first. Basically there are three ways to create a relationship between two tables `A` and `B`:

1. Table `A` has a column that holds table `B`'s id. This relationship is called a `BelongsToOneRelation` in objection.
   We can say that `A` belongs to one `B`.

2. Table `B` has a column that holds table `A`'s id. This relationship is called a `HasManyRelation` in objection.
   We can say that `A` has many `B`'s.

3. Table `C` has columns for both `A` and `B` tables' identifiers. This relationship is called `ManyToManyRelation` in objection.
   Each row in `C` joins one `A` with one `B`. Therefore an `A` row can be related to multiple `B` rows and a `B` row can be related to
   multiple `A` rows through table `C`.

4. Table `A` has a column that holds an array of table `B`'s ids. This relationship is called a `BelongsToManyRelation` in objection.
   We can say that `A` belongs to many `B`'s.

While relations are usually created between the primary key of one table and a foreign key reference of another table, objection has no such limitations. You can create relationship using any two columns (or any sets of columns). You can even create relation using values nested deep inside json columns.

If you've used other ORMs you may notice that objection's [relationMappings](/api/model/static-properties.html#static-relationmappings) are pretty verbose. There are couple of reasons for that:

1. For a new user, this style underlines what is happening, and which columns and tables are involved.

2. You only need to define relations once. Writing a couple of lines more for clarity shouldn't impact your productivity.

## Examples

Vocabulary for the relation descriptions:

- source model: The model for which you are writing the `relationMapping` for.
- related model: The model at the other end of the relation.

`BelongsToOneRelation`: Use this relation when the source model has the foreign key

```js
class Animal extends Model {
  static tableName = 'animals';

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'animals.ownerId',
          to: 'persons.id'
        }
      }
    };
  }
}
```

`HasManyRelation`: Use this relation when the related model has the foreign key

```js
class Person extends Model {
  static tableName = 'persons';

  static get relationMappings() {
    return {
      animals: {
        relation: Model.HasManyRelation,
        modelClass: Animal,
        join: {
          from: 'persons.id',
          to: 'animals.ownerId'
        }
      }
    };
  }
}
```

`HasOneRelation`: Just like `HasManyRelation` but for one related row

```js
class Person extends Model {
  static tableName = 'persons';

  static get relationMappings() {
    return {
      animal: {
        relation: Model.HasOneRelation,
        modelClass: Animal,
        join: {
          from: 'persons.id',
          to: 'animals.ownerId'
        }
      }
    };
  }
}
```

`ManyToManyRelation`: Use this relation when the model is related to a list of other models through a join table

```js
class Person extends Model {
  static tableName = 'persons';

  static get relationMappings() {
    return {
      movies: {
        relation: Model.ManyToManyRelation,
        modelClass: Movie,
        join: {
          from: 'persons.id',
          through: {
            // persons_movies is the join table.
            from: 'persons_movies.personId',
            to: 'persons_movies.movieId'
          },
          to: 'movies.id'
        }
      }
    };
  }
}
```

`HasOneThroughRelation`: Use this relation when the model is related to a single model through a join table

```js
class Person extends Model {
  static tableName = 'persons';

  static get relationMappings() {
    return {
      movie: {
        relation: Model.HasOneThroughRelation,
        modelClass: Movie,
        join: {
          from: 'persons.id',
          through: {
            // persons_movies is the join table.
            from: 'persons_movies.personId',
            to: 'persons_movies.movieId'
          },
          to: 'movies.id'
        }
      }
    };
  }
}
```

`BelongsToManyRelation`: Use this relation when the source model holds an array of the related models' keys

```js
class Post extends Model {
  static tableName = 'posts';

  // The JSON array is parsed and stringified like any other JSON column.
  static jsonAttributes = ['tagIds'];

  static get relationMappings() {
    return {
      tags: {
        relation: Model.BelongsToManyRelation,
        modelClass: Tag,
        join: {
          // posts.tagIds holds an array like [1, 4, 7].
          from: 'posts.tagIds',
          to: 'tags.id'
        }
      }
    };
  }
}
```

The array can be a JSON column on all databases: `json` or `jsonb` on PostgreSQL, `json` on MySQL, and a text column on SQLite and SQL Server. PostgreSQL also supports native array columns like `integer[]`, which are left out of `jsonAttributes`. The array can also sit inside a JSON column, mapped with a field expression like `'posts.data:tagIds'`. On SQL Server, the relation needs SQL Server 2016 or newer for `OPENJSON`. The keys in the array need to have the same JSON type as the related column, e.g. numbers for an integer `id`, and not strings like the `bigint` ids that node-postgres returns: on PostgreSQL and MySQL, joins and queries for owner ids or subqueries find no related rows for keys of another type. Only single-column keys are supported, and `relatedQuery().for()` with a query of another model class needs to select the array under the name of the owner's column.

The related models of each owner come in the order of the relation query, e.g. as sorted by a modifier with `orderBy()`, not in the order of the keys in the array. A related model that the arrays of several owners hold is assigned to each of them. `limit()`, `offset()` and `first()` in the modifiers of `withGraphFetched()` can't be applied to each owner, and require the `limitPerParent: false` graph option.

`relate()` adds keys to the arrays of the owners, and `unrelate()` removes the keys of the related rows that its query finds, so keys of rows that don't exist stay. `insert()` through the relation inserts the related models and adds their keys, and `delete()` deletes the related rows and removes their keys from the arrays of the owners of the query, not from other rows that hold them. These methods read the arrays and write the changed ones back with separate queries, so concurrent writes to the arrays of the same owners can overwrite each other: run them in a transaction that locks the owner rows first, e.g. with `forUpdate()`. Keys are stored as they are given, so pass them in the type of the related column, e.g. numbers and not the strings of request parameters, which PostgreSQL and MySQL wouldn't find in joins and queries for owner ids. For a JSON field expression like `'posts.data:tagIds'`, only the array at that path is written, which SQL Server doesn't support. `$setRelated()` and `$appendRelated()` keep the array of the model in sync with the related models.

`insertGraph()` and `upsertGraph()` add the keys of the related models in the graph to the array, in the order of the graph. Like for the other to-many relations, the list in an `upsertGraph()` is the full list: related models that are left out are deleted, or only removed from the array with the `unrelate` option, and kept with `noDelete` or `noUnrelate`. Keys of rows that the relation's filter leaves out, and of rows that don't exist, stay in the array. Keys that the array already holds keep their place and their value, e.g. `relate('1')` doesn't replace a stored `1`.

## Circular imports (require loops)

Circular imports (circular dependencies, require loops) are a very common problem when defining relations. Whenever a module `A` imports module `B` that imports module `A`, one of the two modules is evaluated before the other one has finished. With ECMAScript modules, accessing the other module's class during that time throws a `ReferenceError`. With CommonJS modules, `require()` returns an incomplete, often empty, exports object instead, which causes all kinds of problems. In CommonJS, objection attempts to detect these situations and mention the words `require loop` in the thrown error. Objection offers multiple solutions to this problem. See the circular dependency solutions examples in this section. In addition to objection's solutions, you can always organize your code so that such loops are not created.

```js
import { Model } from 'objection';
import Animal from './Animal.js';

class Person extends Model {
  static get tableName() {
    return 'persons';
  }

  static get relationMappings() {
    // Solution 1:
    //
    // relationMappings getter is accessed lazily when you execute
    // your first query that needs it. By then all modules have been
    // evaluated, so you can use the imported models inside the getter
    // even if the modules import each other. `relationMappings` can
    // also be a method or a thunk if you prefer those instead of getters.
    return {
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Animal,
        join: {
          from: 'persons.id',
          to: 'animals.ownerId'
        }
      }
    };
  }
}
```

The other solutions replace the `modelClass` of a relation, and also work when `relationMappings` is a static class field, which is evaluated when the class is defined:

```js
import path from 'node:path';
import { Model } from 'objection';
import Movie from './Movie.js';

class Person extends Model {
  static tableName = 'persons';

  static relationMappings = {
    movies: {
      relation: Model.ManyToManyRelation,
      // Solution 2:
      //
      // A thunk that returns the model class. objection calls it
      // lazily, when the relation is first needed.
      modelClass: () => Movie,

      // Solution 3:
      //
      // Absolute file path to a module that exports the model class.
      // objection loads the module under the hood when it is first
      // needed. The downside here is that you need to give an
      // absolute file path.
      // modelClass: path.join(import.meta.dirname, 'Movie.js'),

      // Solution 4:
      //
      // Use only a module name and define a `modelPaths` property
      // for your model (or a superclass of your model). Search for
      // `modelPaths` from the docs for more info.
      // modelClass: 'Movie',

      join: {
        from: 'persons.id',
        through: {
          // persons_movies is the join table.
          from: 'persons_movies.personId',
          to: 'persons_movies.movieId'
        },
        to: 'movies.id'
      }
    }
  };
}
```

In CommonJS modules, solution 1 only works if you `require()` the models inside the getter instead of at the top of the file, because `require()` returns an incomplete exports object while the other module is still being evaluated. Only one end of the relation needs to be required like this, not both.

For solutions 3 and 4, objection loads the file synchronously with `require()`, which on node 20.19 and newer loads both CommonJS modules and ECMAScript modules that don't use top-level await, or import modules that do. An ECMAScript module needs to export the model class as its default export, or as its only exported model class. Paths without a file extension are resolved the way `require()` resolves them, which finds `.js` files, but not `.mjs` files.
