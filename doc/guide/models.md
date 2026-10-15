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

## Deriving model properties in TypeScript

A model's properties don't need to be declared next to its `jsonSchema` and `relationMappings`. Declare the schema `as const` and merge `FromModel` of the class into it with an interface of the same name:

```ts
import { FromModel, Model } from 'objection';

class Person extends Model {
  static tableName = 'persons';

  static jsonSchema = {
    type: 'object',
    required: ['firstName'],
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string', minLength: 1 },
      lastName: { type: ['string', 'null'] },
      role: { enum: ['admin', 'user'] },
      parentId: { type: ['integer', 'null'] }
    }
  } as const;

  static relationMappings = () => ({
    parent: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: {
        from: 'persons.parentId',
        to: 'persons.id'
      }
    },
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

interface Person extends FromModel<typeof Person> {}

const person = await Person.query().findById(1).throwIfNotFound();
person.firstName; // string
person.lastName; // string | null | undefined
person.role; // 'admin' | 'user' | undefined
person.parent; // Person | null | undefined
person.pets; // Animal[] | undefined
```

Relations are optional, as they are only present when fetched, e.g. with `withGraphFetched()`, which narrows them to present. To-one relations (`BelongsToOneRelation`, `HasOneRelation` and `HasOneThroughRelation`) are typed `M | null`, as `withGraphFetched()` sets a missing one to `null`, and to-many relations `M[]`. `modelClass` can be a class or a function returning one, and the mappings a thunk, a static property or a getter. Relations whose type can't be read are left out and can be declared by hand: those with a module path as `modelClass`, and mappings declared with the general types `RelationMapping` or `RelationType` instead of being inferred.

`FromModel` derives the properties from the schema with `FromJSONSchema`, which understands `type` (also as an array like `['string', 'null']`), `required`, `nullable`, `enum`, `const`, `items` (also as a tuple), nested `properties`, `anyOf` and `oneOf`. Properties that aren't `required` are optional, and formats like `'date-time'` stay strings, as in JSON. Without `as const`, TypeScript widens the schema and `FromJSONSchema` can't read it. `FromJSONSchema` also types schemas outside of models, e.g. of JSON columns or request bodies: `FromJSONSchema<typeof addressSchema>`.

`as const` gives `static jsonSchema` the literal type of the schema, so a subclass can't replace it with a schema that requires more properties. For models that subclasses extend, declare the schema as a constant, give the static the general type `ReadonlyJSONSchema`, and derive the properties from the constant with `FromJSONSchema`. `FromModel` still adds the relations:

```ts
import { FromModel, FromJSONSchema, Model, ReadonlyJSONSchema } from 'objection';

const entrySchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer' }
  }
} as const;

class Entry extends Model {
  static jsonSchema: ReadonlyJSONSchema = entrySchema;

  static relationMappings = () => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: {
        from: 'entries.ownerId',
        to: 'persons.id'
      }
    }
  });
}

interface Entry
  extends FromJSONSchema<typeof entrySchema>, FromModel<typeof Entry> {}

const noteSchema = {
  type: 'object',
  required: [...entrySchema.required, 'text'],
  properties: {
    ...entrySchema.properties,
    text: { type: 'string' }
  }
} as const;

class Note extends Entry {
  static jsonSchema = noteSchema;
}

interface Note extends FromModel<typeof Note> {}
```

`FromModel` also reads `virtualAttributes` declared `as const`, so that the type of `toJSON()` includes the results of the methods listed there. Getters still need to be listed, but are typed as properties already:

```ts
class Person extends Model {
  static virtualAttributes = ['fullName'] as const;

  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

interface Person extends FromModel<typeof Person> {}

person.toJSON().fullName; // string
```

Like `jsonSchema`, models that subclasses extend with more virtual attributes declare the general type, `static virtualAttributes: readonly string[]`, and the subclasses list all of their virtual attributes `as const`.

## Checking relation mappings in TypeScript

When the relation properties of a model are declared by hand, TypeScript doesn't check them against `relationMappings` by default. Models with `FromModel` don't need this check, and can't use it: `TypedRelationMappings` reads the relation properties that `FromModel` derives from the mappings. Add `satisfies TypedRelationMappings<Person>` to the mappings to check that each key is a relation property of `Person`, that the relation type fits the property (`BelongsToOneRelation`, `HasOneRelation` or `HasOneThroughRelation` for a single model, `HasManyRelation`, `ManyToManyRelation` or `BelongsToManyRelation` for an array), and that `modelClass` matches the property's model type:

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

## Checking queries in TypeScript

In strict mode, the typings check the column names and values of queries against the models. Strict mode is opt-in, turned on by augmenting `TypeConfig`:

```ts
declare module 'objection' {
  interface TypeConfig {
    strict: true;
  }
}
```

A column is a property of the model that is neither a method nor a relation, nor starts with `$`. Columns qualified with a relation path, as objection names joined relations, are checked against the related model, whether the relation is joined before or after:

```ts
await Person.query()
  .where('firstName', 'Jennifer')
  .where('pets.species', 'dog')
  .where('pets:owner.age', '>', 30)
  .joinRelated('pets.owner')
  .orderBy('lastName');

await Person.query().where('firstNme', 'Jennifer'); // Error: not a column of Person
await Person.query().where('pets.nme', 'Fluffy'); // Error: not a column of Animal
await Person.query().where('age', 'thirty'); // Error: age is a number
```

`where()`, `select()`, `orderBy()`, `groupBy()`, `having()`, the aggregates, `whereIn()` and the other column methods are checked this way, and so are the names of relations in relation expressions, e.g. in `withGraphFetched()` and `joinRelated()`. Values are checked against the property types: `null` is accepted for any column, and dates also take strings.

Qualifiers that aren't relation paths, like table names and aliases, are passed through unchecked: `persons.firstName`, or `p.name` after `joinRelated('pets as p')`. Column names that aren't literals, columns of other queries, and aliases of selections outside of `orderBy()` are referenced with `ref()`, or passed as `raw()`:

```ts
await Person.query().orderBy(ref(sortColumn));
await Animal.query().whereColumn('animals.ownerId', ref('persons.id'));
```

`select()` and the aggregates narrow the rows of the result to the selected columns, next to the model's methods and relations. Aliases take the type of their column, `count()`, `sum()` and `avg()` give numbers, but some drivers return them as strings, e.g. Postgres for bigint and numeric, and raw and subquery selections add properties of unknown type. `orderBy()` takes the aliases of the selections next to the columns:

```ts
const people = await Person.query()
  .select('persons.id', 'firstName as name')
  .count('pets.id as petCount')
  .joinRelated('pets')
  .groupBy('persons.id', 'firstName')
  .orderBy('petCount', 'desc');

people[0].name; // string
people[0].petCount; // number | string
people[0].lastName; // Error: not selected
```

`select('*')` and `select('persons.*')` keep all columns, `first()`, `findById()`, `page()` and `withGraphFetched()` keep the narrowed rows, and repeated selections add up. `clearSelect()` gives back all columns. `distinctOn()` doesn't select its columns and `jsonExtract()` isn't a selection: they don't narrow the rows, and `jsonExtract()` adds its alias to them, of unknown type.

Models that map their columns with `snakeCaseMappers()` declare it, see [Snake case to camel case conversion](/recipes/snake-case-to-camel-case-conversion.html). Queries for models without declared columns, like the base `Model`, and queries in generic code, e.g. in the methods of custom query builders, aren't checked. After `withGraphFetched()` on a generic query builder, e.g. `this.$query()` in a model method, TypeScript resolves the narrowed query builder to a union, on which only `ref()` and `raw()` columns are accepted.

The names of modifiers are checked too, in `modify()` and in relation expressions, for queries started from a model class, like `Person.query()` and `Person.relatedQuery('pets')`: against the class's `modifiers`, including inherited ones, the `modifiers` of the related class at each step of a relation path, found through `relationMappings`, and the modifiers registered with `modifiers()`. The types require `modifiers()` to come before the methods that use the names, although the order doesn't matter when the query runs:

```ts
await Person.query().modify('olderThan', 30).withGraphFetched('pets(onlyDogs)');
await Person.query().modifiers({ latest }).withGraphFetched('pets(latest)');

await Person.query().modify('olderThn', 30); // Error: not a modifier of Person
await Person.query().withGraphFetched('pets(orderByAge)'); // Error: not a modifier of Animal
await Person.query().withGraphFetched('pets(latest)').modifiers({ latest }); // Error: registered after
```

The arguments of the modifiers aren't checked. Names in variables are typed as names of the modifiers, e.g. `keyof typeof Person.modifiers`, as `modify()` rejects names typed `string`. Queries started from instances, like `person.$relatedQuery('pets')`, or in generic code, relation expressions that aren't literals, aliased relations, the expressions of `modifyGraph()`, `allowGraph()` and `fetchGraph()`, classes whose `modifiers` have the general type `Modifiers`, e.g. because their `modifierNotFound()` handles any name, and relations whose mappings have the general type `RelationMappings` or a module path as `modelClass` aren't checked. Neither are models that override `query()`, which declare `this` as `ConstructorType<M>` in strict mode:

```ts
class BaseModel extends Model {
  static query<M extends Model>(this: ConstructorType<M>, trx?: TransactionOrKnex) {
    return super.query(trx).where('deletedAt', null) as QueryBuilderType<M>;
  }
}
```

A modifier that returns a query with `modify()` on its own class needs a return type, as TypeScript would have to infer the class's `modifiers` to check the name:

```ts
class Person extends Model {
  static modifiers = {
    adults: (query: QueryBuilder<Person>) => query.where('age', '>=', 18),
    parentsOfAdults: (query: QueryBuilder<Person>): QueryBuilder<Person> =>
      query.whereIn('id', Person.query().modify('adults').select('parentId')),
  };
}
```

## Typing generated properties in TypeScript

`insert()` accepts any subset of the model's properties without the relations, and `insertGraph()` accepts the relations too. To check that the data for a new row is complete, mark the properties the database generates, like auto-incremented ids, timestamps or columns with defaults, as `Generated`, and type the data as `Insertable`:

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

`Generated<number>` reads and assigns like a `number`. `Insertable<Person>` requires all properties except optional, nullable and `Generated` ones, and leaves out relations. `InsertableGraph<Person>` adds the relations, which hold the insertable graphs of the related models or `#dbRef` / `#ref` references, and the `#id` of the graph. Both are assignable to the argument types of `insert()` and `insertGraph()`, which still treat all properties as optional. `Generated` also works in an [interface merged into the model](#typing-model-properties-with-an-interface-in-typescript).
