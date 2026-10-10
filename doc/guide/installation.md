# Installation

Objection.js can be installed using `npm` or `yarn`. Objection uses [knex](https://knexjs.org/) as its database access layer, so you also need to install it.

```bash
npm install objection knex
yarn add objection knex
```

Objection is an ES module and needs node `^20.19.0 || >=22.12.0`: node 20.19 or newer within node 20, or node 22.12 or newer. The examples in this documentation use `import`, but CommonJS code can still load objection with `require('objection')`, see the [migration notes](/release-notes/migration.html#objection-is-an-es-module-package).

You also need to install one of the following depending on the database you want to use:

```bash
npm install pg
npm install sqlite3
npm install mysql
npm install mysql2
```

You can use the `next` tag to install an alpha/beta/RC version:

```bash
npm install objection@next
```
