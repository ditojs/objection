# `module` objection

```js
import * as objection from 'objection';
import { Model, ref } from 'objection';
```

The objection module is what you get when you import objection. It has a bunch of properties that are listed below.

## Model

```js
import { Model } from 'objection';
```

[The model class](/api/model/)

## initialize

```js
import { initialize } from 'objection';
```

For some queries objection needs to perform asynchronous operations in preparation, like fetch table metadata from the db. Objection does these preparations on-demand the first time such query is executed. However, some methods like `toKnexQuery` need these preparations to have been made so that the query can be built synchronously. In these cases you can use `initialize` to "warm up" the models and do all needed async preparations needed. You only need to call this function once if you choose to use it.

Calling this function is completely optional. If some method requires this to have been called, they will throw a clear error message asking you to do so. These cases are extremely rare, but this function is here for those cases.

You can also call this function if you want to be in control of when these async preparation operations get executed. It can be helpful for example in tests.

##### Examples

```js
import { initialize } from 'objection';

await initialize(knex, [Person, Movie, Pet, SomeOtherModelClass]);
```

If knex has been installed for the `Model` globally, you can omit the first argument.

```js
import { initialize } from 'objection';

await initialize([Person, Movie, Pet, SomeOtherModelClass]);
```

## transaction

```js
import { transaction } from 'objection';
```

[The transaction function](/guide/transactions.html)

## ref

```js
import { ref } from 'objection';
```

Factory function that returns a [ReferenceBuilder](/api/types/#class-referencebuilder) instance, that makes it easier to refer to tables, columns, json attributes etc. [ReferenceBuilder](/api/types/#class-referencebuilder) can also be used to type cast and alias the references.

See [FieldExpression](/api/types/#type-fieldexpression) for more information about how to refer to json fields.

##### Examples

```js
import { ref } from 'objection';

await Model.query()
  .select([
    'id',
    ref('Model.jsonColumn:details.name').castText().as('name'),
    ref('Model.jsonColumn:details.age').castInt().as('age'),
  ])
  .join(
    'OtherModel',
    ref('Model.jsonColumn:details.name').castText(),
    '=',
    ref('OtherModel.name'),
  )
  .where('age', '>', ref('OtherModel.ageLimit'));
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

## raw

```js
import { raw } from 'objection';
```

Factory function that returns a [RawBuilder](/api/types/#class-rawbuilder) instance. [RawBuilder](/api/types/#class-rawbuilder) is a wrapper for knex raw method that doesn't depend on knex. Instances of [RawBuilder](/api/types/#class-rawbuilder) are converted to knex raw instances lazily when the query is executed.

Also see [the raw query recipe](/recipes/raw-queries.html).

##### Examples

When using raw SQL segments in queries, it's a good idea to use placeholders instead of adding user input directly to the SQL to avoid injection errors. Placeholders are sent to the database engine which then takes care of interpolating the SQL safely.

You can use `??` as a placeholder for identifiers (column names, aliases etc.) and `?` for values.

```js
import { raw } from 'objection';

const result = await Person.query()
  .select(raw('coalesce(sum(??), 0) as ??', ['age', 'ageSum']))
  .where('age', '<', raw('? + ?', [50, 25]));

console.log(result[0].ageSum);
```

You can use `raw` in insert and update queries too:

```js
await Person.query().patch({
  age: raw('age + ?', 10),
});
```

You can also use named placeholders. `:someName:` for identifiers (column names, aliases etc.) and `:someName` for values.

```js
await Person.query()
  .select(
    raw('coalesce(sum(:sumColumn:), 0) as :alias:', {
      sumColumn: 'age',
      alias: 'ageSum',
    }),
  )
  .where(
    'age',
    '<',
    raw(':value1 + :value2', {
      value1: 50,
      value2: 25,
    }),
  );
```

You can nest `ref`, `raw`, `val` and query builders (both knex and objection) in `raw` calls

```js
import { val } from 'objection';

await Person
  .query()
  .select(raw('coalesce(:sumQuery, 0) as :alias:', {
    sumQuery: Person.query().sum('age'),
    alias: 'ageSum'
  }))
  .where('age', '<', raw(':value1 + :value2', {
    value1: val(50)
    value2: knex.raw('25')
  }));
```

## val

```js
import { val } from 'objection';
```

Factory function that returns a [ValueBuilder](/api/types/#class-valuebuilder) instance. [ValueBuilder](/api/types/#class-valuebuilder) helps build values of different types.

##### Examples

```js
import { val, ref } from 'objection';

// Compare json objects
await Model.query().where(
  ref('Model.jsonColumn:details'),
  '=',
  val({ name: 'Jennifer', age: 29 }),
);

// Insert an array.
await Model.query().insert({
  numbers: val([1, 2, 3]).asArray().castTo('real[]'),
});
```

## fn

```js
import { fn } from 'objection';
```

Factory function that returns a [FunctionBuilder](/api/types/#class-functionbuilder) instance. `fn` helps calling SQL functions. The signature is:

```js
const functionBuilder = fn(functionName, ...args);
```

For example:

```js
fn('coalesce', ref('age'), 0);
```

The `fn` function also has shortcuts for most common functions:

```js
fn.now();
fn.now(precision);
fn.coalesce(...args);
fn.concat(...args);
fn.sum(...args);
fn.avg(...args);
fn.min(...args);
fn.max(...args);
fn.count(...args);
fn.upper(...args);
fn.lower(...args);
```

All arguments are interpreted as values by default. Use `ref` to refer to columns. you can also pass `raw` instances, other `fn` instances, `QueryBuilders` knex builders, knex raw and anything else just like to any other objection method.

##### Examples

```js
import { fn, ref } from 'objection';

// Compare nullable numbers
await Model.query().where(fn('coalesce', ref('age'), 0), '>', 30);

// The same example using the fn.coalesce shortcut
await Model.query().where(fn.coalesce(ref('age'), 0), '>', 30);
```

Note that it can often be cleaner to use `raw` or `whereRaw`:

```js
await Model.query().whereRaw('coalesce(age, 0) > ?', 30);
```

## mixin

```js
import { mixin } from 'objection';
```

The mixin helper for applying multiple [plugins](/guide/plugins.html).

##### Examples

```js
import { mixin, Model } from 'objection';

class Person extends mixin(Model, [
  SomeMixin,
  SomeOtherMixin,
  EvenMoreMixins,
  LolSoManyMixins,
  ImAMixinWithOptions({ foo: 'bar' }),
]) {}
```

## compose

```js
import { compose } from 'objection';
```

The compose helper for applying multiple [plugins](/guide/plugins.html).

##### Examples

```js
import { compose, Model } from 'objection';

const mixins = compose(
  SomeMixin,
  SomeOtherMixin,
  EvenMoreMixins,
  LolSoManyMixins,
  ImAMixinWithOptions({ foo: 'bar' }),
);

class Person extends mixins(Model) {}
```

## snakeCaseMappers

```js
import { snakeCaseMappers } from 'objection';
```

Function for adding snake_case to camelCase conversion to objection models. Better documented [here](/recipes/snake-case-to-camel-case-conversion.html). The `snakeCaseMappers` function accepts an options object. The available options are:

| Option                            | Type    | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| upperCase                         | boolean | `false` | Set to `true` if your columns are UPPER_SNAKE_CASED.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| underscoreBeforeDigits            | boolean | `false` | When `true`, will place an underscore before digits (`foo1Bar2` becomes `foo_1_bar_2`). When `false`, `foo1Bar2` becomes `foo1_bar2`.                                                                                                                                                                                                                                                                                                                                 |
| underscoreBetweenUppercaseLetters | boolean | `false` | When `true`, will place underscores between consecutive uppercase letters (`fooBAR` becomes `foo_b_a_r`). When `false`, `fooBAR` will become `foo_bar`.                                                                                                                                                                                                                                                                                                               |
| noDoubleUnderscores               | boolean | `false` | When `true`, will never insert an underscore directly after an existing one (with `underscoreBeforeDigits`, `foo_1` stays `foo_1` instead of becoming `foo__1`; `foo_Bar` becomes `foo_bar` instead of `foo__bar`). Underscores already present in the input are kept as is.                                                                                                                                                                                          |
| preserveJsonKeys                  | boolean | `false` | When `true`, only the column part of [field expressions](/api/types/#type-fieldexpression) used as property names, e.g. in `patch({ 'jsonColumn:someKey': value })`, is converted and the JSON path is kept as written (`json_column:someKey`). When `false`, the JSON keys are converted too (`json_column:some_key`). Keys of objects stored in JSON columns are never converted. Enabling this changes which JSON keys existing field expression updates write to. |

##### Examples

```js
import { Model, snakeCaseMappers } from 'objection';

class Person extends Model {
  static get columnNameMappers() {
    return snakeCaseMappers();
  }
}
```

If your columns are UPPER_SNAKE_CASE

```js
import { Model, snakeCaseMappers } from 'objection';

class Person extends Model {
  static get columnNameMappers() {
    return snakeCaseMappers({ upperCase: true });
  }
}
```

To only convert the column part of field expressions and keep their JSON keys as written

```js
import { Model, snakeCaseMappers } from 'objection';

class Person extends Model {
  static get columnNameMappers() {
    return snakeCaseMappers({ preserveJsonKeys: true });
  }
}

// update "persons" set "json_column" = jsonb_set("json_column", '{someKey}', '1', true)
await Person.query().patch({ 'jsonColumn:someKey': 1 });
```

## knexSnakeCaseMappers

```js
import { knexSnakeCaseMappers } from 'objection';
```

Function for adding a snake_case to camelCase conversion to `knex`. Better documented [here](/recipes/snake-case-to-camel-case-conversion.html). The `knexSnakeCaseMappers` function accepts an options object. The available options are:

| Option                            | Type    | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| upperCase                         | boolean | `false` | Set to `true` if your columns are UPPER_SNAKE_CASED.                                                                                                                                                                                                                                                                                                                                                         |
| underscoreBeforeDigits            | boolean | `false` | When `true`, will place an underscore before digits (`foo1Bar2` becomes `foo_1_bar_2`). When `false`, `foo1Bar2` becomes `foo1_bar2`.                                                                                                                                                                                                                                                                        |
| underscoreBetweenUppercaseLetters | boolean | `false` | When `true`, will place underscores between consecutive uppercase letters (`fooBAR` becomes `foo_b_a_r`). When `false`, `fooBAR` will become `foo_bar`.                                                                                                                                                                                                                                                      |
| noDoubleUnderscores               | boolean | `false` | When `true`, will never insert an underscore directly after an existing one (with `underscoreBeforeDigits`, `foo_1` stays `foo_1` instead of becoming `foo__1`; `foo_Bar` becomes `foo_bar` instead of `foo__bar`). Underscores already present in the input are kept as is.                                                                                                                                 |
| mapNestedKeys                     | boolean | `false` | When `true`, the keys of plain objects one level down in the results are converted too, as needed for knex's `nestTables: true` option on MySQL, which returns rows like `{ table_name: { column_name: value } }`. This also converts the top-level keys of JSON columns that the database driver returns as parsed objects, e.g. with `mysql2` or `pg`. The `mysql` driver returns JSON columns as strings. As the option applies to all queries of the knex instance, use a separate instance for the `nestTables` queries. |

##### Examples

```js
import { knexSnakeCaseMappers } from 'objection';
import Knex from 'knex';

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  }

  ...knexSnakeCaseMappers()
});
```

If your columns are UPPER_SNAKE_CASE

```js
import { knexSnakeCaseMappers } from 'objection';
import Knex from 'knex';

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  }

  ...knexSnakeCaseMappers({ upperCase: true })
});
```

To also convert the column names in the results of knex's `nestTables: true` option on MySQL

```js
import { knexSnakeCaseMappers } from 'objection';
import Knex from 'knex';

const knex = Knex({
  client: 'mysql',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  }

  ...knexSnakeCaseMappers({ mapNestedKeys: true })
});

const rows = await knex('personsTable')
  .join('animalsTable', 'personsTable.idColumn', 'animalsTable.ownerId')
  .options({ nestTables: true });

// [{ personsTable: { idColumn: 1, firstName: 'Jennifer' }, animalsTable: { ... } }]
console.log(rows);
```

## knexIdentifierMapping

```js
import { knexIdentifierMapping } from 'objection';
```

Like [knexSnakeCaseMappers](/api/objection/#knexsnakecasemappers), but can be used to make an arbitrary static mapping between column names and property names. In the examples, you would have identifiers `MyId`, `MyProp` and `MyAnotherProp` in the database and you would like to map them into `id`, `prop` and `anotherProp` in the code. Like `knexSnakeCaseMappers`, it accepts the `mapNestedKeys` option as a second argument: `knexIdentifierMapping(colToProp, { mapNestedKeys: true })`.

##### Examples

```js
import { knexIdentifierMapping } from 'objection';
import Knex from 'knex';

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  }

  ...knexIdentifierMapping({
    MyId: 'id',
    MyProp: 'prop',
    MyAnotherProp: 'anotherProp'
  })
});
```

Note that you can pretty easily define the conversions in some static property of your model. In this example we have added a property `column` to jsonSchema and use that to create the mapping object.

```js
import { knexIdentifierMapping } from 'objection';
import Knex from 'knex';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Path to your model folder.
const MODELS_PATH = path.join(import.meta.dirname, 'models');

// Import all models.
const modelClasses = await Promise.all(
  fs.readdirSync(MODELS_PATH)
    .filter(it => it.endsWith('.js'))
    .map(async it => (await import(pathToFileURL(path.join(MODELS_PATH, it)).href)).default)
);

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  }

  // Go through all models and add conversions using the custom property
  // `column` in json schema.
  ...knexIdentifierMapping(
    modelClasses.reduce((mapping, modelClass) => {
      const properties = modelClass.jsonSchema.properties;
      return Object.keys(properties).reduce((mapping, propName) => {
        mapping[properties[propName].column] = propName;
        return mapping;
      }, mapping);
    }, {});
  )
});
```

## ValidationError

```js
import { ValidationError } from 'objection';
```

The [ValidationError](/api/types/#class-validationerror) class.

## NotFoundError

```js
import { NotFoundError } from 'objection';
```

The [NotFoundError](/api/types/#class-notfounderror) class.

## DBError

```js
import { DBError } from 'objection';
```

The [DBError](https://github.com/Vincit/db-errors#dberror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.

## ConstraintViolationError

```js
import { ConstraintViolationError } from 'objection';
```

The [ConstraintViolationError](https://github.com/Vincit/db-errors#constraintviolationerror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.

## UniqueViolationError

```js
import { UniqueViolationError } from 'objection';
```

The [UniqueViolationError](https://github.com/Vincit/db-errors#uniqueviolationerror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.

## NotNullViolationError

```js
import { NotNullViolationError } from 'objection';
```

The [NotNullViolationError](https://github.com/Vincit/db-errors#notnullviolationerror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.

## ForeignKeyViolationError

```js
import { ForeignKeyViolationError } from 'objection';
```

The [ForeignKeyViolationError](https://github.com/Vincit/db-errors#foreignkeyviolationerror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.

## CheckViolationError

```js
import { CheckViolationError } from 'objection';
```

The [CheckViolationError](https://github.com/Vincit/db-errors#checkviolationerror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.

## DataError

```js
import { DataError } from 'objection';
```

The [DataError](https://github.com/Vincit/db-errors#dataerror) class from objection's own copy of the [db-errors](https://github.com/Vincit/db-errors) library.
