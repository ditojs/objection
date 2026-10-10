import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Knex from 'knex';
import * as objection from 'objection';
import knexMocker from '../../../testUtils/mockKnex.js';
import { RelationOwner } from '../../../lib/relations/RelationOwner.js';

const Model = objection.Model,
  QueryBuilder = objection.QueryBuilder,
  BelongsToOneRelation = objection.BelongsToOneRelation;

describe('BelongsToOneRelation', () => {
  let mockKnexQueryResults = [];
  let executedQueries = [];
  let mockKnex = null;

  let OwnerModel = null;
  let RelatedModel = null;

  let relation;
  let compositeKeyRelation;

  beforeAll(() => {
    let knex = Knex({ client: 'pg' });

    mockKnex = knexMocker(knex, function (mock, oldImpl, args) {
      executedQueries.push(this.toString());

      let result = mockKnexQueryResults.shift() || [];
      let promise = Promise.resolve(result);

      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    mockKnexQueryResults = [];
    executedQueries = [];

    OwnerModel = class OwnerModel extends Model {
      static get tableName() {
        return 'OwnerModel';
      }
    };

    RelatedModel = class RelatedModel extends Model {
      static get tableName() {
        return 'RelatedModel';
      }

      static get modifiers() {
        return {
          modifier: (builder) => builder.where('filteredProperty', true),
        };
      }
    };

    OwnerModel.knex(mockKnex);
    RelatedModel.knex(mockKnex);
  });

  beforeEach(() => {
    relation = new BelongsToOneRelation('nameOfOurRelation', OwnerModel);
    relation.setMapping({
      modelClass: RelatedModel,
      relation: BelongsToOneRelation,
      join: {
        from: 'OwnerModel.relatedId',
        to: 'RelatedModel.rid',
      },
    });

    compositeKeyRelation = new BelongsToOneRelation('nameOfOurRelation', OwnerModel);
    compositeKeyRelation.setMapping({
      modelClass: RelatedModel,
      relation: BelongsToOneRelation,
      join: {
        from: ['OwnerModel.relatedAId', 'OwnerModel.relatedBId'],
        to: ['RelatedModel.aid', 'RelatedModel.bid'],
      },
    });
  });

  describe('find', () => {
    it('should generate a find query', () => {
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 1 });
      let expectedResult = [{ id: 1, a: 10, rid: 1 }];

      mockKnexQueryResults = [expectedResult];

      let builder = QueryBuilder.forClass(RelatedModel).findOperationFactory((builder) => {
        return relation.find(builder, RelationOwner.create(owner));
      });

      return builder.then((result) => {
        expect(result).toEqual(expectedResult[0]);
        expect(owner.nameOfOurRelation).toEqual(expectedResult[0]);
        expect(result).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(
          'select "RelatedModel".* from "RelatedModel" where "RelatedModel"."rid" in (1)',
        );
      });
    });

    it('should generate a find query (composite key)', () => {
      let expectedResult = [
        { id: 1, aid: 11, bid: 22 },
        { id: 2, aid: 11, bid: 33 },
      ];

      mockKnexQueryResults = [expectedResult];

      let owners = [
        OwnerModel.fromJson({ id: 666, relatedAId: 11, relatedBId: 22 }),
        OwnerModel.fromJson({ id: 667, relatedAId: 11, relatedBId: 33 }),
      ];

      let builder = QueryBuilder.forClass(RelatedModel).findOperationFactory((builder) => {
        return compositeKeyRelation.find(builder, RelationOwner.create(owners));
      });

      return builder.then((result) => {
        expect(result).toHaveLength(2);
        expect(result).toEqual(expectedResult);
        expect(owners[0].nameOfOurRelation).toBe(result[0]);
        expect(owners[1].nameOfOurRelation).toBe(result[1]);
        expect(result[0]).toBeInstanceOf(RelatedModel);
        expect(result[1]).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(
          'select "RelatedModel".* from "RelatedModel" where ("RelatedModel"."aid", "RelatedModel"."bid") in ((11, 22), (11, 33))',
        );
      });
    });

    it('should find for multiple owners', () => {
      let expectedResult = [
        { id: 1, a: 10, rid: 2 },
        { id: 2, a: 10, rid: 3 },
      ];

      mockKnexQueryResults = [expectedResult];

      let owners = [
        OwnerModel.fromJson({ id: 666, relatedId: 2 }),
        OwnerModel.fromJson({ id: 667, relatedId: 3 }),
      ];

      let builder = QueryBuilder.forClass(RelatedModel).findOperationFactory((builder) => {
        return relation.find(builder, RelationOwner.create(owners));
      });

      return builder.then((result) => {
        expect(result).toHaveLength(2);
        expect(result).toEqual(expectedResult);
        expect(owners[0].nameOfOurRelation).toBe(result[0]);
        expect(owners[1].nameOfOurRelation).toBe(result[1]);
        expect(result[0]).toBeInstanceOf(RelatedModel);
        expect(result[1]).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(
          'select "RelatedModel".* from "RelatedModel" where "RelatedModel"."rid" in (2, 3)',
        );
      });
    });

    it('explicit selects should override the RelatedModel.*', () => {
      let expectedResult = [{ id: 1, a: 10, rid: 2 }];
      mockKnexQueryResults = [expectedResult];
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .findOperationFactory((builder) => {
          return relation.find(builder, RelationOwner.create(owner));
        })
        .select('name');

      return builder.then((result) => {
        expect(result).toEqual(expectedResult[0]);
        expect(owner.nameOfOurRelation).toEqual(expectedResult[0]);
        expect(result).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(
          'select "RelatedModel"."rid", "name" from "RelatedModel" where "RelatedModel"."rid" in (2)',
        );
      });
    });

    it('should apply the modifier (object)', () => {
      createModifiedRelation({ filterCol: 100 });

      let expectedResult = [{ id: 1, a: 10, rid: 1 }];
      mockKnexQueryResults = [expectedResult];
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 1 });

      let builder = QueryBuilder.forClass(RelatedModel).findOperationFactory((builder) => {
        return relation.find(builder, RelationOwner.create(owner));
      });

      return builder.then((result) => {
        expect(result).toEqual(expectedResult[0]);
        expect(owner.nameOfOurRelation).toEqual(expectedResult[0]);
        expect(result).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(
          'select "RelatedModel".* from "RelatedModel" where "RelatedModel"."rid" in (1) and "filterCol" = 100',
        );
      });
    });

    it('should apply the modifier (function)', () => {
      createModifiedRelation((query) => {
        query.where('name', 'Jennifer');
      });

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 1 });
      let expectedResult = [{ id: 1, a: 10, rid: 1 }];
      mockKnexQueryResults = [expectedResult];

      let builder = QueryBuilder.forClass(RelatedModel).findOperationFactory((builder) => {
        return relation.find(builder, RelationOwner.create(owner));
      });

      return builder.then((result) => {
        expect(result).toEqual(expectedResult[0]);
        expect(owner.nameOfOurRelation).toEqual(expectedResult[0]);
        expect(result).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(
          'select "RelatedModel".* from "RelatedModel" where "RelatedModel"."rid" in (1) and "name" = \'Jennifer\'',
        );
      });
    });

    it('should support modifiers', () => {
      createModifiedRelation('modifier');

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 1 });
      let expectedResult = [{ id: 1, a: 10, rid: 1 }];
      mockKnexQueryResults = [expectedResult];

      let builder = QueryBuilder.forClass(RelatedModel).findOperationFactory((builder) => {
        return relation.find(builder, RelationOwner.create(owner));
      });

      return builder.then((result) => {
        expect(result).toEqual(expectedResult[0]);
        expect(owner.nameOfOurRelation).toEqual(expectedResult[0]);
        expect(result).toBeInstanceOf(RelatedModel);

        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'select "RelatedModel".* from "RelatedModel" where "RelatedModel"."rid" in (1) and "filteredProperty" = true',
        );
      });
    });
  });

  describe('insert', () => {
    it('should generate an insert query', () => {
      mockKnexQueryResults = [[1]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = [RelatedModel.fromJson({ a: 'str1', rid: 2 })];

      let builder = QueryBuilder.forClass(RelatedModel)
        .insertOperationFactory((builder) => {
          return relation.insert(builder, RelationOwner.create(owner));
        })
        .insert(related);

      let toString = builder.toKnexQuery().toString();
      let toSql = builder.toKnexQuery().toString();

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(2);
        expect(executedQueries[0]).toBe(toString);
        expect(executedQueries[0]).toBe(toSql);
        expect(executedQueries[0]).toBe(
          'insert into "RelatedModel" ("a", "rid") values (\'str1\', 2) returning "id"',
        );
        expect(executedQueries[1]).toBe(
          'update "OwnerModel" set "relatedId" = 2 where "OwnerModel"."id" in (666)',
        );

        expect(owner.nameOfOurRelation).toBe(result[0]);
        expect(owner.relatedId).toBe(2);
        expect(result).toEqual([{ a: 'str1', id: 1, rid: 2 }]);
        expect(result[0]).toBeInstanceOf(RelatedModel);
      });
    });

    it('should generate an insert query (composite key)', () => {
      mockKnexQueryResults = [[{ aid: 11, bid: 22 }]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = [RelatedModel.fromJson({ a: 'str1', aid: 11, bid: 22 })];

      let builder = QueryBuilder.forClass(RelatedModel)
        .insertOperationFactory((builder) => {
          return compositeKeyRelation.insert(builder, RelationOwner.create(owner));
        })
        .insert(related);

      let toString = builder.toKnexQuery().toString();
      let toSql = builder.toKnexQuery().toString();

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(2);
        expect(executedQueries[0]).toBe(toString);
        expect(executedQueries[0]).toBe(toSql);
        expect(executedQueries[0]).toBe(
          'insert into "RelatedModel" ("a", "aid", "bid") values (\'str1\', 11, 22) returning "id"',
        );
        expect(executedQueries[1]).toBe(
          'update "OwnerModel" set "relatedAId" = 11, "relatedBId" = 22 where "OwnerModel"."id" in (666)',
        );

        expect(owner.relatedAId).toBe(11);
        expect(owner.relatedBId).toBe(22);
        expect(owner.nameOfOurRelation).toBe(result[0]);
        expect(result).toEqual([{ a: 'str1', aid: 11, bid: 22 }]);
        expect(result[0]).toBeInstanceOf(RelatedModel);
      });
    });

    it('should accept json object array', () => {
      mockKnexQueryResults = [[5]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = [{ a: 'str1', rid: 2 }];

      return QueryBuilder.forClass(RelatedModel)
        .insertOperationFactory((builder) => {
          return relation.insert(builder, RelationOwner.create(owner));
        })
        .insert(related)
        .then((result) => {
          expect(executedQueries).toHaveLength(2);
          expect(executedQueries[0]).toBe(
            'insert into "RelatedModel" ("a", "rid") values (\'str1\', 2) returning "id"',
          );
          expect(executedQueries[1]).toBe(
            'update "OwnerModel" set "relatedId" = 2 where "OwnerModel"."id" in (666)',
          );
          expect(owner.nameOfOurRelation).toBe(result[0]);
          expect(owner.relatedId).toBe(2);
          expect(result).toEqual([{ a: 'str1', id: 5, rid: 2 }]);
          expect(result[0]).toBeInstanceOf(RelatedModel);
        });
    });

    it('should accept single model', () => {
      mockKnexQueryResults = [[1]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = RelatedModel.fromJson({ a: 'str1', rid: 2 });

      return QueryBuilder.forClass(RelatedModel)
        .insertOperationFactory((builder) => {
          return relation.insert(builder, RelationOwner.create(owner));
        })
        .insert(related)
        .then((result) => {
          expect(executedQueries).toHaveLength(2);
          expect(executedQueries[0]).toBe(
            'insert into "RelatedModel" ("a", "rid") values (\'str1\', 2) returning "id"',
          );
          expect(executedQueries[1]).toBe(
            'update "OwnerModel" set "relatedId" = 2 where "OwnerModel"."id" in (666)',
          );
          expect(owner.nameOfOurRelation).toBe(result);
          expect(owner.relatedId).toBe(2);
          expect(result).toEqual({ a: 'str1', id: 1, rid: 2 });
          expect(result).toBeInstanceOf(RelatedModel);
        });
    });

    it('should accept single json object', () => {
      mockKnexQueryResults = [[1]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = { a: 'str1', rid: 2 };

      return QueryBuilder.forClass(RelatedModel)
        .insertOperationFactory((builder) => {
          return relation.insert(builder, RelationOwner.create(owner));
        })
        .insert(related)
        .then((result) => {
          expect(executedQueries).toHaveLength(2);
          expect(executedQueries[0]).toBe(
            'insert into "RelatedModel" ("a", "rid") values (\'str1\', 2) returning "id"',
          );
          expect(executedQueries[1]).toBe(
            'update "OwnerModel" set "relatedId" = 2 where "OwnerModel"."id" in (666)',
          );
          expect(owner.nameOfOurRelation).toBe(result);
          expect(owner.relatedId).toBe(2);
          expect(result).toEqual({ a: 'str1', id: 1, rid: 2 });
          expect(result).toBeInstanceOf(RelatedModel);
        });
    });

    it('should fail if trying to insert multiple', () => {
      mockKnexQueryResults = [[1]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = [
        { a: 'str1', rid: 2 },
        { a: 'str1', rid: 2 },
      ];

      return expect(
        QueryBuilder.forClass(RelatedModel)
          .insertOperationFactory((builder) => {
            return relation.insert(builder, RelationOwner.create(owner));
          })
          .insert(related),
      ).rejects.toThrow();
    });

    it('should not apply returning() to the relate query', () => {
      mockKnexQueryResults = [[{ id: 1, a: 'str1', rid: 2 }]];

      let owner = OwnerModel.fromJson({ id: 666 });
      let related = [RelatedModel.fromJson({ a: 'str1', rid: 2 })];

      let builder = QueryBuilder.forClass(RelatedModel)
        .insertOperationFactory((builder) => {
          return relation.insert(builder, RelationOwner.create(owner));
        })
        .insert(related)
        .returning('*');

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(2);
        expect(executedQueries[0]).toBe(
          'insert into "RelatedModel" ("a", "rid") values (\'str1\', 2) returning *',
        );
        expect(executedQueries[1]).toBe(
          'update "OwnerModel" set "relatedId" = 2 where "OwnerModel"."id" in (666)',
        );
        expect(result).toEqual([{ a: 'str1', id: 1, rid: 2 }]);
      });
    });
  });

  describe('update', () => {
    it('should generate an update query', () => {
      mockKnexQueryResults = [42];

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });
      let update = RelatedModel.fromJson({ a: 'str1' });

      let builder = QueryBuilder.forClass(RelatedModel)
        .updateOperationFactory((builder) => {
          return relation.update(builder, RelationOwner.create(owner));
        })
        .update(update);

      return builder.then((numUpdates) => {
        expect(numUpdates).toBe(42);
        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "RelatedModel" set "a" = \'str1\' where "RelatedModel"."rid" in (2)',
        );
      });
    });

    it('should generate an update query (composite key)', () => {
      mockKnexQueryResults = [42];

      let owner = OwnerModel.fromJson({ id: 666, relatedAId: 11, relatedBId: 22 });
      let update = RelatedModel.fromJson({ a: 'str1', aid: 11, bid: 22 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .updateOperationFactory((builder) => {
          return compositeKeyRelation.update(builder, RelationOwner.create(owner));
        })
        .update(update);

      return builder.then((numUpdates) => {
        expect(numUpdates).toBe(42);
        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "RelatedModel" set "a" = \'str1\', "aid" = 11, "bid" = 22 where ("RelatedModel"."aid", "RelatedModel"."bid") in ((11, 22))',
        );
      });
    });

    it('should accept json object', () => {
      mockKnexQueryResults = [42];

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });
      let update = { a: 'str1' };

      return QueryBuilder.forClass(RelatedModel)
        .updateOperationFactory((builder) => {
          return relation.update(builder, RelationOwner.create(owner));
        })
        .update(update)
        .then((numUpdates) => {
          expect(numUpdates).toBe(42);
          expect(executedQueries).toHaveLength(1);
          expect(executedQueries[0]).toEqual(
            'update "RelatedModel" set "a" = \'str1\' where "RelatedModel"."rid" in (2)',
          );
        });
    });

    it('should apply the modifier', () => {
      createModifiedRelation({ someColumn: 'foo' });

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });
      let update = RelatedModel.fromJson({ a: 'str1' });

      return QueryBuilder.forClass(RelatedModel)
        .updateOperationFactory((builder) => {
          return relation.update(builder, RelationOwner.create(owner));
        })
        .update(update)
        .then(() => {
          expect(executedQueries).toHaveLength(1);
          expect(executedQueries[0]).toEqual(
            'update "RelatedModel" set "a" = \'str1\' where "RelatedModel"."rid" in (2) and "someColumn" = \'foo\'',
          );
        });
    });
  });

  describe('patch', () => {
    it('should generate an patch query', () => {
      mockKnexQueryResults = [42];

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });
      let patch = RelatedModel.fromJson({ a: 'str1' });

      let builder = QueryBuilder.forClass(RelatedModel)
        .patchOperationFactory((builder) => {
          return relation.patch(builder, RelationOwner.create(owner));
        })
        .patch(patch);

      return builder.then((numUpdates) => {
        expect(numUpdates).toBe(42);
        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "RelatedModel" set "a" = \'str1\' where "RelatedModel"."rid" in (2)',
        );
      });
    });

    it('should accept json object', () => {
      mockKnexQueryResults = [42];

      RelatedModel.jsonSchema = {
        type: 'object',
        required: ['b'],
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
      };

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });
      let patch = { a: 'str1' };

      return QueryBuilder.forClass(RelatedModel)
        .patchOperationFactory((builder) => {
          return relation.patch(builder, RelationOwner.create(owner));
        })
        .patch(patch)
        .then((numUpdates) => {
          expect(numUpdates).toBe(42);
          expect(executedQueries).toHaveLength(1);
          expect(executedQueries[0]).toEqual(
            'update "RelatedModel" set "a" = \'str1\' where "RelatedModel"."rid" in (2)',
          );
        });
    });

    it('should work with increment', () => {
      mockKnexQueryResults = [42];
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 1 });

      return QueryBuilder.forClass(RelatedModel)
        .patchOperationFactory((builder) => {
          return relation.patch(builder, RelationOwner.create(owner));
        })
        .increment('test', 1)
        .then((numUpdates) => {
          expect(numUpdates).toBe(42);
          expect(executedQueries).toHaveLength(1);
          expect(executedQueries[0]).toEqual(
            'update "RelatedModel" set "test" = "test" + 1 where "RelatedModel"."rid" in (1)',
          );
        });
    });

    it('should work with decrement', () => {
      mockKnexQueryResults = [42];
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });

      return QueryBuilder.forClass(RelatedModel)
        .patchOperationFactory((builder) => {
          return relation.patch(builder, RelationOwner.create(owner));
        })
        .decrement('test', 10)
        .then((numUpdates) => {
          expect(numUpdates).toBe(42);
          expect(executedQueries).toHaveLength(1);
          expect(executedQueries[0]).toEqual(
            'update "RelatedModel" set "test" = "test" - 10 where "RelatedModel"."rid" in (2)',
          );
        });
    });

    it('should apply the modifier', () => {
      mockKnexQueryResults = [42];
      createModifiedRelation({ someColumn: 'foo' });

      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });
      let update = RelatedModel.fromJson({ a: 'str1' });

      return QueryBuilder.forClass(RelatedModel)
        .patchOperationFactory((builder) => {
          return relation.patch(builder, RelationOwner.create(owner));
        })
        .patch(update)
        .then((numUpdates) => {
          expect(numUpdates).toBe(42);
          expect(executedQueries).toHaveLength(1);
          expect(executedQueries[0]).toEqual(
            'update "RelatedModel" set "a" = \'str1\' where "RelatedModel"."rid" in (2) and "someColumn" = \'foo\'',
          );
        });
    });
  });

  describe('delete', () => {
    it('should generate a delete query', () => {
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .deleteOperationFactory((builder) => {
          return relation.delete(builder, RelationOwner.create(owner));
        })
        .delete();

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toEqual([]);
        expect(executedQueries[0]).toEqual(
          'delete from "RelatedModel" where "RelatedModel"."rid" in (2)',
        );
      });
    });

    it('should generate a delete query (composite key)', () => {
      let owner = OwnerModel.fromJson({ id: 666, relatedAId: 11, relatedBId: 22 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .deleteOperationFactory((builder) => {
          return compositeKeyRelation.delete(builder, RelationOwner.create(owner));
        })
        .delete();

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toEqual([]);
        expect(executedQueries[0]).toEqual(
          'delete from "RelatedModel" where ("RelatedModel"."aid", "RelatedModel"."bid") in ((11, 22))',
        );
      });
    });

    it('should apply the modifier', () => {
      createModifiedRelation({ someColumn: 100 });
      let owner = OwnerModel.fromJson({ id: 666, relatedId: 2 });

      return QueryBuilder.forClass(RelatedModel)
        .deleteOperationFactory((builder) => {
          return relation.delete(builder, RelationOwner.create(owner));
        })
        .delete()
        .then((result) => {
          expect(executedQueries).toHaveLength(1);
          expect(result).toEqual([]);
          expect(executedQueries[0]).toEqual(
            'delete from "RelatedModel" where "RelatedModel"."rid" in (2) and "someColumn" = 100',
          );
        });
    });
  });

  describe('relate', () => {
    it('should generate a relate query', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return relation.relate(builder, RelationOwner.create(owner));
        })
        .relate(10);

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toBe(123);

        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedId" = 10 where "OwnerModel"."id" in (666)',
        );
      });
    });

    it('should generate a relate query (array value)', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return relation.relate(builder, RelationOwner.create(owner));
        })
        .relate([10]);

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toBe(123);

        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedId" = 10 where "OwnerModel"."id" in (666)',
        );
      });
    });

    it('should generate a relate query (object value)', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return relation.relate(builder, RelationOwner.create(owner));
        })
        .relate({ rid: 10 });

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toBe(123);

        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedId" = 10 where "OwnerModel"."id" in (666)',
        );
      });
    });

    it('should generate a relate query (array of objects values)', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return relation.relate(builder, RelationOwner.create(owner));
        })
        .relate([{ rid: 10 }]);

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toBe(123);

        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedId" = 10 where "OwnerModel"."id" in (666)',
        );
      });
    });

    it('should generate a relate query (composite key)', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return compositeKeyRelation.relate(builder, RelationOwner.create(owner));
        })
        .relate([10, 20]);

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toBe(123);

        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedAId" = 10, "relatedBId" = 20 where "OwnerModel"."id" in (666)',
        );
      });
    });

    it('should generate a relate query (composite key with object value)', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return compositeKeyRelation.relate(builder, RelationOwner.create(owner));
        })
        .relate({ aid: 10, bid: 20 });

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(result).toBe(123);

        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedAId" = 10, "relatedBId" = 20 where "OwnerModel"."id" in (666)',
        );
      });
    });

    it('should accept one id', () => {
      mockKnexQueryResults = [{ a: 1, b: 2 }];
      let owner = OwnerModel.fromJson({ id: 666 });

      return QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return relation.relate(builder, RelationOwner.create(owner));
        })
        .relate(11)
        .then((result) => {
          expect(executedQueries).toHaveLength(1);
          expect(result).toEqual({ a: 1, b: 2 });
          expect(executedQueries[0]).toEqual(
            'update "OwnerModel" set "relatedId" = 11 where "OwnerModel"."id" in (666)',
          );
        });
    });

    it('should fail if trying to relate multiple', () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      return expect(
        QueryBuilder.forClass(RelatedModel)
          .relateOperationFactory((builder) => {
            return relation.relate(builder, RelationOwner.create(owner));
          })
          .relate([11, 12]),
      ).rejects.toThrow();
    });

    it("should fail if object value doesn't contain the needed id", () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      return expect(
        QueryBuilder.forClass(RelatedModel)
          .relateOperationFactory((builder) => {
            return relation.relate(builder, RelationOwner.create(owner));
          })
          .relate({ wrongId: 10 }),
      ).rejects.toThrow();
    });

    it("should fail if object value doesn't contain the needed id (composite key)", () => {
      mockKnexQueryResults = [123];
      let owner = OwnerModel.fromJson({ id: 666 });

      return expect(
        QueryBuilder.forClass(RelatedModel)
          .relateOperationFactory((builder) => {
            return compositeKeyRelation.relate(builder, RelationOwner.create(owner));
          })
          .relate({ aid: 10, wrongId: 20 }),
      ).rejects.toThrow();
    });

    it('should return the patched owner rows when returning() is used', () => {
      mockKnexQueryResults = [[{ id: 666, relatedId: 10 }]];
      let owner = OwnerModel.fromJson({ id: 666 });

      let builder = QueryBuilder.forClass(RelatedModel)
        .relateOperationFactory((builder) => {
          return relation.relate(builder, RelationOwner.create(owner));
        })
        .relate(10)
        .returning('*');

      return builder.then((result) => {
        expect(executedQueries).toHaveLength(1);
        expect(executedQueries[0]).toBe(builder.toKnexQuery().toString());
        expect(executedQueries[0]).toEqual(
          'update "OwnerModel" set "relatedId" = 10 where "OwnerModel"."id" in (666) returning *',
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toBeInstanceOf(OwnerModel);
        expect(result[0].toJSON()).toEqual({ id: 666, relatedId: 10 });
      });
    });
  });

  describe('unrelate', () => {
    it('should throw if a `through` object is given', () => {
      expect(() => {
        relation = new BelongsToOneRelation('nameOfOurRelation', OwnerModel);

        relation.setMapping({
          modelClass: RelatedModel,
          relation: BelongsToOneRelation,
          join: {
            from: 'OwnerModel.relatedId',
            through: {},
            to: 'RelatedModel.rid',
          },
        });
      }).toThrow(
        expect.objectContaining({
          message:
            'OwnerModel.relationMappings.nameOfOurRelation: Property join.through is not supported for this relation type.',
        }),
      );
    });
  });

  function createModifiedRelation(modifier) {
    relation = new BelongsToOneRelation('nameOfOurRelation', OwnerModel);
    relation.setMapping({
      modelClass: RelatedModel,
      relation: BelongsToOneRelation,
      modify: modifier,
      join: {
        from: 'OwnerModel.relatedId',
        to: 'RelatedModel.rid',
      },
    });
  }
});
