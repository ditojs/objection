import { Model, Page, QueryBuilder, Generated } from 'objection';

export class AppQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare RebindType: AppQueryBuilder<this['~M'], this['~R']>;

  active(): this {
    return this.where('deletedAt', null);
  }

  newest(): this {
    return this.orderBy('createdAt', 'desc');
  }
}

export class BaseModel extends Model {
  declare QueryBuilderType: AppQueryBuilder<this>;
  id!: Generated<number>;
  createdAt!: Generated<Date>;
  updatedAt!: Generated<Date>;
  deletedAt!: Date | null;

  $beforeUpdate() {
    this.updatedAt = new Date() as Generated<Date>;
  }
}
