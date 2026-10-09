import { Model, RelationMappings, TypedRelationMappings } from '../../';
import { Animal } from './fixtures/animal';
import { Movie } from './fixtures/movie';
import { Person } from './fixtures/person';

// Thunk form: the classes referenced in the mappings don't need to be
// initialized when the class is declared.
class Owner extends Model {
  id!: number;
  name!: string;
  pets?: Animal[];
  favoritePet?: Animal | null;
  boss?: Owner;
  employees?: Owner[];
  movies?: Movie[];
  ownerMethod = () => 1;

  static relationMappings = () =>
    ({
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Animal,
        join: { from: 'owners.id', to: 'animals.ownerId' },
        modify: (query) => query.where('species', 'dog'),
        beforeInsert(pet) {
          pet.name = pet.species;
        },
      },
      favoritePet: {
        relation: Model.HasOneRelation,
        modelClass: () => Animal,
        join: { from: 'owners.favoritePetId', to: 'animals.id' },
      },
      boss: {
        relation: Model.BelongsToOneRelation,
        modelClass: Owner,
        join: { from: 'owners.bossId', to: 'owners.id' },
      },
      employees: {
        relation: Model.HasManyRelation,
        // String paths are not checked.
        modelClass: 'owner',
        join: { from: 'owners.id', to: 'owners.bossId' },
      },
      movies: {
        relation: Model.ManyToManyRelation,
        modelClass: Movie,
        join: {
          from: 'owners.id',
          through: { from: 'owners_movies.ownerId', to: 'owners_movies.movieId' },
          to: 'movies.id',
        },
      },
    }) satisfies TypedRelationMappings<Owner>;
}

// The inferred type of the mappings is kept.
const ownerMappings = Owner.relationMappings();
const petsModelClass: typeof Animal = ownerMappings.pets.modelClass;
const relationMappings: RelationMappings = ownerMappings;

// Object form in a static property: not all relations need a mapping.
class Pet extends Model {
  owner?: Owner;
  friends?: Pet[];

  static relationMappings = {
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Owner,
      join: { from: 'pets.ownerId', to: 'owners.id' },
    },
  } satisfies TypedRelationMappings<Pet>;
}

// Static getter with `satisfies`.
class Employee extends Model {
  boss?: Employee;

  static get relationMappings() {
    return {
      boss: {
        relation: Model.HasOneThroughRelation,
        modelClass: Employee,
        join: {
          from: 'employees.id',
          through: { from: 'teams.memberId', to: 'teams.leadId' },
          to: 'employees.id',
        },
      },
    } satisfies TypedRelationMappings<Employee>;
  }
}

// Static getter with a return type.
class Team extends Model {
  members?: Employee[];

  static get relationMappings(): TypedRelationMappings<Team> {
    return {
      members: {
        relation: Model.HasManyRelation,
        modelClass: Employee,
        join: { from: 'teams.id', to: 'employees.teamId' },
      },
    };
  }
}

// Subclasses of the fixture models.
class Customer extends Person {
  static relationMappings = () =>
    ({
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Animal,
        join: { from: 'persons.id', to: 'animals.ownerId' },
      },
      mom: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: { from: 'persons.momId', to: 'persons.id' },
      },
    }) satisfies TypedRelationMappings<Customer>;
}

class WrongCardinalityOne extends Model {
  pets?: Animal[];

  static relationMappings = {
    pets: {
      // @ts-expect-error a BelongsToOneRelation can't hold an array
      relation: Model.BelongsToOneRelation,
      modelClass: Animal,
      join: { from: 'a.id', to: 'animals.ownerId' },
    },
  } satisfies TypedRelationMappings<WrongCardinalityOne>;
}

class WrongCardinalityMany extends Model {
  owner?: Person;

  static relationMappings = {
    owner: {
      // @ts-expect-error a ManyToManyRelation can't hold a single model
      relation: Model.ManyToManyRelation,
      modelClass: Person,
      join: { from: 'a.ownerId', to: 'persons.id' },
    },
  } satisfies TypedRelationMappings<WrongCardinalityMany>;
}

class WrongModelClass extends Model {
  owner?: Person;

  static relationMappings = {
    owner: {
      relation: Model.BelongsToOneRelation,
      // @ts-expect-error the relation property holds a Person
      modelClass: Animal,
      join: { from: 'a.ownerId', to: 'persons.id' },
    },
  } satisfies TypedRelationMappings<WrongModelClass>;
}

class WrongModelClassFactory extends Model {
  pets?: Animal[];

  static relationMappings = () =>
    ({
      pets: {
        relation: Model.HasManyRelation,
        // @ts-expect-error the relation property holds Animals
        modelClass: () => Movie,
        join: { from: 'a.id', to: 'animals.ownerId' },
      },
    }) satisfies TypedRelationMappings<WrongModelClassFactory>;
}

class UnknownRelation extends Model {
  name?: string;
  pets?: Animal[];

  static relationMappings = {
    // @ts-expect-error `name` is not a relation property
    name: {
      relation: Model.HasOneRelation,
      modelClass: Animal,
      join: { from: 'a.id', to: 'animals.ownerId' },
    },
  } satisfies TypedRelationMappings<UnknownRelation>;
}

class NoRelations extends Model {
  name?: string;

  static relationMappings = {
    // @ts-expect-error the model has no relation properties
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Animal,
      join: { from: 'a.id', to: 'animals.ownerId' },
    },
  } satisfies TypedRelationMappings<NoRelations>;
}
