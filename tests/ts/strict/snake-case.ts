// Type tests for models that map their columns with snakeCaseMappers(): they
// declare `ColumnNameMapping: 'snakeCase'`, and queries take the columns in
// snake case, while insert(), patch() and the results use the properties.

import { Model, ModelObject, snakeCaseMappers } from 'objection';

class BaseModel extends Model {
  static columnNameMappers = snakeCaseMappers();
  declare ColumnNameMapping: 'snakeCase';
}

class Animal extends BaseModel {
  static tableName = 'animals';
  id!: number;
  ownerId!: number | null;
  owner?: Person;
}

class Person extends BaseModel {
  static tableName = 'persons';
  id!: number;
  firstName!: string;
  address2Line!: string;
  homeURL!: string;
  createdAt!: Date;
  pets?: Animal[];
}

async function queries() {
  await Person.query().where('first_name', 'Jennifer').orderBy('created_at');
  await Person.query().where('address2_line', 'x').where('home_url', 'x');
  await Person.query().select('id', 'first_name as name').whereIn('first_name', ['a']);
  await Person.query().where({ first_name: 'Jennifer' });
  await Person.query().joinRelated('pets').where('pets.owner_id', 1);
  await Person.query().where('pets:owner.first_name', 'x');
  // @ts-expect-error the property name isn't the column
  await Person.query().where('firstName', 'Jennifer');
  // @ts-expect-error
  await Person.query().where({ firstName: 'Jennifer' });
  // @ts-expect-error
  await Person.query().where('pets.ownerId', 1);
  // @ts-expect-error values are still checked
  await Person.query().where('first_name', 1);
  await Person.query().where('created_at', '<', '2020-01-01');

  // Rows and results use the properties.
  await Person.query().insert({ firstName: 'Jennifer', address2Line: 'x' });
  await Person.query().patch({ firstName: 'Jennifer' });
  const people = await Person.query().where('first_name', 'Jennifer');
  people[0].firstName;
}

// The declaration isn't a property of the model data.
// @ts-expect-error
type _object = ModelObject<Person>['ColumnNameMapping'];

// Long property names convert too.
class Long extends BaseModel {
  id!: number;
  aVeryLongPropertyNameThatGoesOnAndOnForMoreThanSixtyCharacters!: string;
}

async function longNames() {
  await Long.query()
    .where('id', 1)
    .where('a_very_long_property_name_that_goes_on_and_on_for_more_than_sixty_characters', 'x');
}

// A typo in the mapping is an error.
class Typo extends BaseModel {
  // @ts-expect-error
  declare ColumnNameMapping: 'snake_case';
}

// snakeCaseMappers({ upperCase: true }) maps to upper case snake case.
class UpperModel extends Model {
  static columnNameMappers = snakeCaseMappers({ upperCase: true });
  declare ColumnNameMapping: 'upperSnakeCase';
  id!: number;
  firstName!: string;
}

async function upperCase() {
  await UpperModel.query().where('FIRST_NAME', 'Jennifer').orderBy('ID');
  // @ts-expect-error
  await UpperModel.query().where('first_name', 'Jennifer');
}

// Models with other column name mappers declare 'open', and aren't checked.
class Custom extends Model {
  declare ColumnNameMapping: 'open';
  id!: number;
}

async function open() {
  await Custom.query().where('anything', 1);
}
