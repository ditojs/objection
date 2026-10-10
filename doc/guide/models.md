# Models

A [Model](/api/model/) subclass represents a database table and instances of that class represent table rows. Models are created by inheriting from the [Model](/api/model/) class. A [Model](/api/model/) class can define [relationships](/guide/relations.html) (aka. relations, associations) to other models using the static [relationMappings](/api/model/static-properties.html#static-relationmappings) property.

Models can optionally define a [jsonSchema](/api/model/static-properties.html#static-jsonschema) object that is used for input validation. Every time a [Model](/api/model/) instance is created, it is validated against the [jsonSchema](/api/model/static-properties.html#static-jsonschema). Note that [Model](/api/model/) instances are implicitly created whenever you call [insert](/api/query-builder/mutate-methods.html#insert), [insertGraph](/api/query-builder/mutate-methods.html#insertgraph), [patch](/api/query-builder/mutate-methods.html#patch) or any other method that takes in model properties (no validation is done when reading from the database).

Each model must have an identifier column. The identifier column name can be set using the [idColumn](/api/model/static-properties.html#static-idcolumn) property. [idColumn](/api/model/static-properties.html#static-idcolumn) defaults to `"id"`. If your table's identifier is something else, you need to set [idColumn](/api/model/static-properties.html#static-idcolumn). A composite id can be set by giving an array of column names. Composite keys are first class citizens in objection.

In objection, all configuration is done through [Model](/api/model/) classes and there is no global configuration or state. There is no "objection instance". This allows you to create isolated components and for example to use multiple different databases with different configurations in one app. Most of the time you want the same configuration for all models and a good pattern is to create a `BaseModel` class and inherit all your models from that. You can then add all shared configuration to `BaseModel`. See the static properties in [API Reference / Model](/api/model/static-properties.html#static-tablename) section for all available configuration options.

Note that in addition to `idColumn`, you don't define properties, indexes or anything else related to database schema in the model. In objection, database schema is considered a separate concern and should be handled using [migrations](https://knexjs.org/guide/migrations.html). The reasoning is that every non-trivial project will need migrations anyway. Managing the schema in two places (model and migrations) only makes things more complex in the long run.

## Examples

A working model with minimal amount of code:

```js
import { Model } from 'objection';

class MinimalModel extends Model {
  static get tableName() {
    return 'someTableName';
  }
}

export default MinimalModel;
```

Model with custom methods, json schema validation and relations. This model is used in the examples:

```js
import { Model } from 'objection';
import Animal from './Animal.js';
import Movie from './Movie.js';

class Person extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'persons';
  }

  // Each model must have a column (or a set of columns) that uniquely
  // identifies the rows. The column(s) can be specified using the `idColumn`
  // property. `idColumn` returns `id` by default and doesn't need to be
  // specified unless the model's primary key is something else.
  static get idColumn() {
    return 'id';
  }

  // Methods can be defined for model classes just as you would for
  // any JavaScript class. If you want to include the result of these
  // methods in the output json, see `virtualAttributes`.
  fullName() {
    return this.firstName + ' ' + this.lastName;
  }

  // Optional JSON schema. This is not the database schema!
  // No tables or columns are generated based on this. This is only
  // used for input validation. Whenever a model instance is created
  // either explicitly or implicitly it is checked against this schema.
  // See https://json-schema.org/ for more info.
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['firstName', 'lastName'],

      properties: {
        id: { type: 'integer' },
        parentId: { type: ['integer', 'null'] },
        firstName: { type: 'string', minLength: 1, maxLength: 255 },
        lastName: { type: 'string', minLength: 1, maxLength: 255 },
        age: { type: 'number' },

        // Properties defined as objects or arrays are
        // automatically converted to JSON strings when
        // writing to database and back to objects and arrays
        // when reading from database. To override this
        // behaviour, you can override the
        // Model.jsonAttributes property.
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            zipCode: { type: 'string' }
          }
        }
      }
    };
  }

  // This object defines the relations to other models.
  static get relationMappings() {
    // Accessing the imported models in a getter is one way to
    // avoid problems with circular imports.
    return {
      pets: {
        relation: Model.HasManyRelation,
        // The related model. This can be either a Model
        // subclass constructor or an absolute file path
        // to a module that exports one. We use a model
        // subclass constructor `Animal` here.
        modelClass: Animal,
        join: {
          from: 'persons.id',
          to: 'animals.ownerId'
        }
      },

      movies: {
        relation: Model.ManyToManyRelation,
        modelClass: Movie,
        join: {
          from: 'persons.id',
          // ManyToMany relation needs the `through` object
          // to describe the join table.
          through: {
            // If you have a model class for the join table
            // you need to specify it like this:
            // modelClass: PersonMovie,
            from: 'persons_movies.personId',
            to: 'persons_movies.movieId'
          },
          to: 'movies.id'
        }
      },

      children: {
        relation: Model.HasManyRelation,
        modelClass: Person,
        join: {
          from: 'persons.id',
          to: 'persons.parentId'
        }
      },

      parent: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'persons.parentId',
          to: 'persons.id'
        }
      }
    };
  }
}
```

## Typing model properties with an interface in TypeScript

In TypeScript, the properties of a model are usually declared as class fields. If you'd rather describe them with an interface, for example one you also use for request bodies, declare an interface with the same name as the model class. TypeScript merges the interface into the class, so the properties are known on instances, in query results and in the arguments of methods like `insert` and `patch`:

```ts
import { Model } from 'objection';

interface PersonProps {
  id: number;
  firstName: string;
  lastName: string;
  pets?: Animal[];
}

// The interface has the same name as the class and is merged into it.
interface Person extends PersonProps {}

class Person extends Model {
  static tableName = 'persons';

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Animal,
      join: {
        from: 'persons.id',
        to: 'animals.ownerId'
      }
    }
  });
}

const people = await Person.query().where('firstName', 'Jennifer');
console.log(people[0].lastName);

await Person.query().insert({ firstName: 'Jennifer', lastName: 'Lawrence' });
```

The type-only properties of a [custom query builder](/recipes/custom-query-builder.html#extending-the-query-builder-in-typescript) can go in the merged interface too:

```ts
interface Person extends PersonProps {
  QueryBuilderType: MyQueryBuilder<this>;
}

class Person extends Model {
  static QueryBuilder = MyQueryBuilder;
}
```

## Checking relation mappings in TypeScript

The relation properties of a model have to be declared by hand, and TypeScript doesn't check them against `relationMappings` by default. Add `satisfies TypedRelationMappings<Person>` to the mappings to check that each key is a relation property of `Person`, that the relation type fits the property (`BelongsToOneRelation`, `HasOneRelation` or `HasOneThroughRelation` for a single model, `HasManyRelation` or `ManyToManyRelation` for an array), and that `modelClass` matches the property's model type:

```ts
import { Model, TypedRelationMappings } from 'objection';

class Person extends Model {
  pets?: Animal[];
  parent?: Person | null;

  static relationMappings = () =>
    ({
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Animal,
        join: {
          from: 'persons.id',
          to: 'animals.ownerId'
        }
      },
      parent: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'persons.parentId',
          to: 'persons.id'
        }
      }
    }) satisfies TypedRelationMappings<Person>;
}
```

`satisfies` keeps the inferred type of the mappings. It works with the thunk above, with a static property holding the object, and with a static getter, either returning `{ ... } satisfies TypedRelationMappings<Person>` or declared with `TypedRelationMappings<Person>` as return type. Put `satisfies` on the returned object, not on the thunk: on a function, TypeScript doesn't report unknown keys. The thunk or getter also avoids accessing model classes before they are initialized, e.g. with circular imports.

`modelClass` is only checked when it is a class or a function returning one, not when it is a module path. Models are compared structurally, so a model class whose instances have all the properties of the expected model passes too.

## Typing generated properties in TypeScript

`insert()` and `insertGraph()` accept any subset of the model's properties. To check that the data for a new row is complete, mark the properties the database generates, like auto-incremented ids, timestamps or columns with defaults, as `Generated`, and type the data as `Insertable`:

```ts
import { Model, Generated, Insertable, InsertableGraph } from 'objection';

class Person extends Model {
  id!: Generated<number>;
  createdAt!: Generated<Date>;
  firstName!: string;
  lastName?: string;
  middleName!: string | null;
  pets?: Animal[];
}

const person = await Person.query().findById(1).throwIfNotFound();
const id: number = person.id;

const data: Insertable<Person> = { firstName: 'Jennifer' };
await Person.query().insert(data);

await Person.query().insertGraph({
  firstName: 'Jennifer',
  pets: [{ name: 'Doggo', species: 'dog' }]
} satisfies InsertableGraph<Person>);
```

`Generated<number>` reads and assigns like a `number`. `Insertable<Person>` requires all properties except optional, nullable and `Generated` ones, and leaves out relations. `InsertableGraph<Person>` adds the relations, which hold the insertable graphs of the related models or `#dbRef` / `#ref` references, and the `#id` of the graph. Both are assignable to the argument types of `insert()` and `insertGraph()`, which themselves are unchanged and still treat all properties as optional. `Generated` also works in an [interface merged into the model](#typing-model-properties-with-an-interface-in-typescript).
