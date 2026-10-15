import { Model, QueryBuilder } from 'objection';

export class Program extends Model {
  static tableName = 'programs';
  id!: number;
  name!: string;
}

export class Animal extends Model {
  static tableName = 'animals';
  id!: number;
  name!: string;
  ownerId!: number | null;
  owner?: Person;
}

export class Person extends Model {
  static tableName = 'persons';
  id!: number;
  firstName!: string;
  lastName?: string;
  age!: number | null;
  pets?: Animal[];
  program?: Program;
  parent?: Person | null;
  children?: Person[];

  fullName() {
    return this.firstName + ' ' + this.lastName;
  }

  // Where `this` is generic, the narrowed query builder is a union, on which
  // `modify()` can be called.
  petsQuery() {
    return this.$query().withGraphFetched('pets').modify('someModifier');
  }
}

// Models with a custom query builder, as in the custom query builder recipe.

export class CustomQueryBuilder<M extends Model, R = M[], X = unknown> extends QueryBuilder<
  M,
  R,
  X
> {
  declare RebindType: CustomQueryBuilder<this['~M'], this['~R'], this['~X']>;

  someCustomMethod(): this {
    return this;
  }
}

export class BaseModel extends Model {
  declare QueryBuilderType: CustomQueryBuilder<this>;
}

export class CustomPet extends BaseModel {
  static tableName = 'animals';
  id!: number;
  name!: string;
  owner?: CustomPerson;
}

export class CustomPerson extends BaseModel {
  static tableName = 'persons';
  id!: number;
  firstName!: string;
  pets?: CustomPet[];
  parent?: CustomPerson;
}
