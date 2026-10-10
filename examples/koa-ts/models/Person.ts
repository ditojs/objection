import { Model, type Generated, type Modifiers, type TypedRelationMappings } from 'objection'
import Animal from './Animal.js'
import Movie from './Movie.js'

export default class Person extends Model {
  declare id: Generated<number>
  declare parentId: number | null
  declare firstName: string
  declare lastName: string
  declare age?: number
  declare address?: {
    street?: string
    city?: string
    zipCode?: string
  }

  declare pets?: Animal[]
  declare movies?: Movie[]
  declare children?: Person[]
  declare parent?: Person

  // Table name is the only required property.
  static tableName = 'persons'

  // Optional JSON schema. This is not the database schema! Nothing is generated
  // based on this. This is only used for validation. Whenever a model instance
  // is created it is checked against this schema. http://json-schema.org/.
  static jsonSchema = {
    type: 'object',
    required: ['firstName', 'lastName'],

    properties: {
      id: { type: 'integer' },
      parentId: { type: ['integer', 'null'] },
      firstName: { type: 'string', minLength: 1, maxLength: 255 },
      lastName: { type: 'string', minLength: 1, maxLength: 255 },
      age: { type: 'number' },

      address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
          zipCode: { type: 'string' },
        },
      },
    },
  }

  // Modifiers are reusable query snippets that can be used in various places.
  static modifiers: Modifiers = {
    // Our example modifier is a a semi-dumb fuzzy name match. We split the
    // name into pieces using whitespace and then try to partially match
    // each of those pieces to both the `firstName` and the `lastName`
    // fields.
    searchByName(query, name) {
      // This `where` simply creates parentheses so that other `where`
      // statements don't get mixed with the these.
      query.where((query) => {
        for (const namePart of name.trim().split(/\s+/)) {
          for (const column of ['firstName', 'lastName']) {
            query.orWhereRaw('lower(??) like ?', [column, namePart.toLowerCase() + '%'])
          }
        }
      })
    },
  }

  // This object defines the relations to other models. The thunk is only
  // called once the relations are needed, after all modules are loaded, so
  // the circular imports between the models are not a problem. `satisfies`
  // checks the mappings against the relation properties declared above.
  static relationMappings = () =>
    ({
      pets: {
        relation: Model.HasManyRelation,
        // The related model.
        modelClass: Animal,
        join: {
          from: 'persons.id',
          to: 'animals.ownerId',
        },
      },

      movies: {
        relation: Model.ManyToManyRelation,
        modelClass: Movie,
        join: {
          from: 'persons.id',
          // ManyToMany relation needs the `through` object to describe the join table.
          through: {
            from: 'persons_movies.personId',
            to: 'persons_movies.movieId',
          },
          to: 'movies.id',
        },
      },

      children: {
        relation: Model.HasManyRelation,
        modelClass: Person,
        join: {
          from: 'persons.id',
          to: 'persons.parentId',
        },
      },

      parent: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'persons.parentId',
          to: 'persons.id',
        },
      },
    }) satisfies TypedRelationMappings<Person>
}
