import { Model, type Generated, type TypedRelationMappings } from 'objection'
import Person from './Person.js'

export default class Animal extends Model {
  declare id: Generated<number>
  declare ownerId: number | null
  declare name: string
  declare species: string

  declare owner?: Person

  // Table name is the only required property.
  static tableName = 'animals'

  // Optional JSON schema. This is not the database schema! Nothing is generated
  // based on this. This is only used for validation. Whenever a model instance
  // is created it is checked against this schema. http://json-schema.org/.
  static jsonSchema = {
    type: 'object',
    required: ['name'],

    properties: {
      id: { type: 'integer' },
      ownerId: { type: ['integer', 'null'] },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      species: { type: 'string', minLength: 1, maxLength: 255 },
    },
  }

  // This object defines the relations to other models. The thunk is only
  // called once the relations are needed, after all modules are loaded, so
  // the circular imports between the models are not a problem. `satisfies`
  // checks the mappings against the relation properties declared above.
  static relationMappings = () =>
    ({
      owner: {
        relation: Model.BelongsToOneRelation,
        // The related model.
        modelClass: Person,

        join: {
          from: 'animals.ownerId',
          to: 'persons.id',
        },
      },
    }) satisfies TypedRelationMappings<Animal>
}
