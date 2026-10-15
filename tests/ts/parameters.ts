// Type tests for wrappers that forward their arguments to the query builder
// methods through `Parameters<>`, which only sees the last overload.

import { QueryBuilder, raw } from 'objection';
import { Person } from './fixtures/person.js';

function where(...args: Parameters<QueryBuilder<Person>['where']>) {
  return Person.query().where(...args);
}

function findOne(...args: Parameters<QueryBuilder<Person>['findOne']>) {
  return Person.query().findOne(...args);
}

function whereIn(...args: Parameters<QueryBuilder<Person>['whereIn']>) {
  return Person.query().whereIn(...args);
}

function select(...args: Parameters<QueryBuilder<Person>['select']>) {
  return Person.query().select(...args);
}

(async () => {
  await where({ firstName: 'Jennifer', unknown: 1 });
  await findOne({ firstName: 'Jennifer' });
  await whereIn('id', [1, 2]);
  await whereIn(['id', 'firstName'], Person.query().select('id', 'firstName'));
  await select('id', 'firstName', raw('1'));
  await select(['id', 'firstName']);
})();
