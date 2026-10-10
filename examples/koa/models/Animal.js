import { Model } from 'objection'
import Person from './Person.js'

export default class Animal extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'animals'
  }

  // Optional JSON schema. This is not the database schema! Nothing is generated
  // based on this. This is only used for validation. Whenever a model instance
  // is created it is checked against this schema. http://json-schema.org/.
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],

      properties: {
        id: { type: 'integer' },
        ownerId: { type: ['integer', 'null'] },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        species: { type: 'string', minLength: 1, maxLength: 255 },
      },
    }
  }

  // This object defines the relations to other models. The getter is only
  // accessed once the relations are needed, after all modules are loaded, so
  // the circular imports between the models are not a problem.
  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,

        // The related model.
        modelClass: Person,

        join: {
          from: 'animals.ownerId',
          to: 'persons.id',
        },
      },
    }
  }
}
