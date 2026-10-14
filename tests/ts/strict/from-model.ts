// Type tests for strict mode with model properties derived from the JSON
// schema and the relation mappings with FromModel.

import { FromModel, Model } from 'objection';

class Owner extends Model {
  static tableName = 'owners';
  static jsonSchema = {
    type: 'object',
    required: ['id', 'firstName'],
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string' },
      bossId: { type: ['integer', 'null'] },
    },
  } as const;

  static relationMappings = () => ({
    boss: {
      relation: Model.BelongsToOneRelation,
      modelClass: Owner,
      join: { from: 'owners.bossId', to: 'owners.id' },
    },
    pets: {
      relation: Model.HasManyRelation,
      modelClass: () => Pet,
      join: { from: 'owners.id', to: 'pets.ownerId' },
    },
  });
}

interface Owner extends FromModel<typeof Owner> {}

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

interface Pet extends FromModel<typeof Pet> {}

async function queries() {
  await Owner.query()
    .where('firstName', 'Jennifer')
    .joinRelated('boss.pets')
    .where('boss:pets.name', 'Fluffy');
  await Owner.query().withGraphFetched('[boss.boss, pets]').orderBy('pets.name');
  // @ts-expect-error
  await Owner.query().where('firstNme', 'Jennifer');
  // @ts-expect-error
  await Owner.query().where('bossId', 'one');
  // @ts-expect-error
  await Owner.query().withGraphFetched('boss.petz');
  // @ts-expect-error
  await Owner.query().joinRelated('pets').where('pets.nme', 'Fluffy');
}
