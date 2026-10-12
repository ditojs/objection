// Type tests for strict mode with model properties derived from the JSON
// schema with FromSchema.

import { FromSchema, Model } from 'objection';

class Owner extends Model {
  static tableName = 'owners';
  static jsonSchema = {
    type: 'object',
    required: ['id', 'firstName'],
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string' },
      role: { enum: ['admin', 'user'] },
    },
  } as const;

  pets?: Pet[];
}

interface Owner extends FromSchema<typeof Owner.jsonSchema> {}

class Pet extends Model {
  static tableName = 'pets';
  static jsonSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      ownerId: { type: ['integer', 'null'] },
    },
  } as const;
}

interface Pet extends FromSchema<typeof Pet.jsonSchema> {}

async function queries() {
  await Owner.query().where('firstName', 'Jennifer').where('role', 'admin');
  await Owner.query().joinRelated('pets').where('pets.ownerId', null);
  // @ts-expect-error
  await Owner.query().where('firstNme', 'Jennifer');
  // @ts-expect-error
  await Owner.query().where('role', 'guest');
  // @ts-expect-error
  await Owner.query().joinRelated('pets').where('pets.nme', 'Fluffy');
}
