# Timestamps

You can implement the [\$beforeInsert](/api/model/instance-methods.html#beforeinsert) and [\$beforeUpdate](/api/model/instance-methods.html#beforeupdate) methods to set the timestamps. If you want to do this for all your models, you can simply create common base class that implements these methods.

```js
class Person extends Model {
  $beforeInsert() {
    this.created_at = new Date().toISOString();
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }
}
```

## Dates from the database

In a `jsonSchema`, timestamps are strings with `format: 'date-time'`. Validation only accepts strings for them, and `FromJSONSchema` and `FromModel` type them as `string`. But the pg, mysql and mssql drivers return the date columns that knex creates, e.g. with `date()`, `datetime()` and `timestamp()`, as `Date` objects. SQLite returns what was stored: write ISO strings, as above, as it stores a `Date` as milliseconds. To hold strings in the models on the other databases, convert the values in [\$parseDatabaseJson](/api/model/instance-methods.html#parsedatabasejson):

```js
class BaseModel extends Model {
  $parseDatabaseJson(json, options) {
    json = super.$parseDatabaseJson(json, options);
    for (const [key, value] of Object.entries(json)) {
      if (value instanceof Date) {
        json[key] = value.toISOString();
      }
    }
    return json;
  }
}
```

pg returns `date` columns as a `Date` at local midnight, which `toISOString()` can move to the day before. Return them as strings instead, with `pg.types.setTypeParser(1082, (value) => value)`.

Models that hold `Date` objects declare these properties themselves, as `Date`, instead of deriving them from the schema, and leave them out of the schema's string properties, as validation would reject them.
