import Knex from 'knex';
import { Model } from 'objection';
import knexConfig from './knexfile.js';
import { Person } from './models/Person.js';

// Initialize knex.
const knex = Knex(knexConfig.development);

// Bind all Models to the knex instance. You only
// need to do this once before you use any of
// your model classes.
Model.knex(knex);

try {
  // Delete all persons from the db.
  await Person.query().delete();

  // Insert one row to the database.
  await Person.query().insert({
    firstName: 'Jennifer',
    lastName: 'Aniston',
  });

  // Read all rows from the db.
  const people = await Person.query();

  console.log(people);
} finally {
  await knex.destroy();
}
