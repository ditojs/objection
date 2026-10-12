import {
  Generated,
  Model,
  Pojo,
  QueryBuilder,
  RelationExpression,
  WithGraphOptions,
  WithGraphQueryBuilder,
} from 'objection';

export class Program extends Model {
  static tableName = 'programs';
  id!: Generated<number>;
  name!: string;
  createdAt!: Generated<Date>;
}

export class Animal extends Model {
  static tableName = 'animals';
  id!: number;
  name!: string;
  species!: 'dog' | 'cat';
  ownerId!: number | null;
  owner?: Person;
}

export class Person extends Model {
  static tableName = 'persons';
  id!: number;
  firstName!: string;
  lastName?: string;
  age!: number | null;
  active!: boolean;
  createdAt!: Date;
  tags!: string[];
  address!: Pojo;
  deletedAt!: Date | null;
  settings!: { theme: string } | null;
  meta!: any;
  extra!: unknown;
  pets?: Animal[];
  program?: Program;
  parent?: Person | null;
  children?: Person[];

  fullName() {
    return this.firstName + ' ' + this.lastName;
  }
}

// A custom query builder, as in the custom query builder recipe.

export class CustomQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare RebindType: CustomQueryBuilder<this['~M'], this['~R']>;

  someCustomMethod(): this {
    return this;
  }

  withGraph<const E extends RelationExpression<M>>(
    expr: E,
    options?: WithGraphOptions,
  ): WithGraphQueryBuilder<this, E> {
    return super.withGraph(expr, options);
  }

  firstByName(name: string) {
    return this.where('name', name).first();
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
}
