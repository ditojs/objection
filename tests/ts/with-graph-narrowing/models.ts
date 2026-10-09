import { Model, Page, QueryBuilder } from '../../../';

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
}

// Models with a custom query builder, as in the custom query builder recipe.

export class CustomQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare ArrayQueryBuilderType: CustomQueryBuilder<M, M[]>;
  declare SingleQueryBuilderType: CustomQueryBuilder<M, M>;
  declare MaybeSingleQueryBuilderType: CustomQueryBuilder<M, M | undefined>;
  declare NumberQueryBuilderType: CustomQueryBuilder<M, number>;
  declare PageQueryBuilderType: CustomQueryBuilder<M, Page<M>>;

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
