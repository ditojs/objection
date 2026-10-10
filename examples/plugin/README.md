# Objection.js example plugin

This project serves as the best practices example of an objection.js plugin.

The plugin adds a `session` method for `QueryBuilder` and extends a model
so that it sets `modifiedAt`, `modifiedBy`, `createdAt` and `createdBy` properties
automatically based on the given session.

Usage example:

```js
import { Model } from 'objection';
import Session from 'path/to/this/example/index.js';

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

  // Our plugin set the following properties.
  console.log(person.createdAt);
  console.log(person.createdBy);

  res.send(person);
});
```

# Install and run the tests

```sh
git clone git@github.com:ditojs/objection.git objection
cd objection/examples/plugin
npm install
npm test
```
