// Type tests for declaration emit: exported functions that return queries
// and rows need nameable types, as in libraries and composite projects. The
// type tests are checked with `declaration: true`.

import { raw } from 'objection';
import { CustomPerson, Person, Program } from './models.js';

export function selection() {
  return Person.query().select('id', 'firstName as name');
}

export function rawSelection() {
  return Person.query().select(raw('1 as one'));
}

export function aggregate() {
  return Person.query().count('id as n').first();
}

export async function rows() {
  return await Person.query().select('id').max('age as oldest').groupBy('id');
}

export function generated() {
  return Program.query().select('id', 'createdAt');
}

export function graph() {
  return Person.query().withGraphFetched('pets').select('id');
}

export function custom() {
  return CustomPerson.query().select('id').someCustomMethod();
}

export function extraction() {
  return Person.query().select('id').jsonExtract('address', '$.street', 'street');
}
