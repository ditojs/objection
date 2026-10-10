# Objection.js example plugin with options

This project serves as the best practices example of an objection.js plugin that takes options.

The plugin adds a `session` method for `QueryBuilder` and extends a model
so that it sets `modifiedAt`, `modifiedBy`, `createdAt` and `createdBy` properties
automatically based on the given session.

This example is exactly the same as the [plugin](https://github.com/ditojs/objection/tree/main/examples/plugin)
example but this one accepts options. The only difference is that the main module is a factory method that accepts options
and returns a mixin.

Usage example:

```js
import { Model } from 'objection';
import sessionPlugin from 'path/to/this/example/index.js';

const Session = sessionPlugin({
  setCreatedBy: false,
  setModifiedBy: false,
});

export default class Person extends Session(Model) {
  static get tableName() {
    return 'Person';
  }
}
```

```js
// expressjs route.
router.post('/persons', async (req, res) => {
  const person = await Person.query()
    // The following method was added by our plugin.
    .session(req.session)
    .insert(req.body);

  // Our plugin set the following property.
  console.log(person.createdAt);
  // This wasn't set because of the `setCreatedBy: false` option.
  console.log(person.createdBy); // -->  undefined

  res.send(person);
});
```

# Install and run the tests

```sh
git clone git@github.com:ditojs/objection.git objection
cd objection/examples/plugin-with-options
npm install
npm test
```
