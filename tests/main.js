import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as dbErrors from '../lib/dbErrors/index.js';
import * as objectionNamespace from 'objection';
import { QueryBuilderBase } from '../lib/queryBuilder/QueryBuilderBase.js';
import { QueryBuilderOperation } from '../lib/queryBuilder/operations/QueryBuilderOperation.js';
import { RelationExpression } from '../lib/queryBuilder/RelationExpression.js';
import { ValidationError } from '../lib/model/ValidationError.js';
import { NotFoundError } from '../lib/model/NotFoundError.js';
import { Relation } from '../lib/relations/Relation.js';
import { HasManyRelation } from '../lib/relations/hasMany/HasManyRelation.js';
import { HasOneRelation } from '../lib/relations/hasOne/HasOneRelation.js';
import { BelongsToOneRelation } from '../lib/relations/belongsToOne/BelongsToOneRelation.js';
import { HasOneThroughRelation } from '../lib/relations/hasOneThrough/HasOneThroughRelation.js';
import { ManyToManyRelation } from '../lib/relations/manyToMany/ManyToManyRelation.js';
import { transaction } from '../lib/transaction.js';
import { ref } from '../lib/queryBuilder/ReferenceBuilder.js';
import { raw } from '../lib/queryBuilder/RawBuilder.js';
import { val } from '../lib/queryBuilder/ValueBuilder.js';
import { mixin, compose } from '../lib/utils/mixin.js';
import { Validator } from '../lib/model/Validator.js';
import { AjvValidator } from '../lib/model/AjvValidator.js';
import { Model } from '../lib/model/Model.js';
import { QueryBuilder } from '../lib/queryBuilder/QueryBuilder.js';

const require = createRequire(import.meta.url);

describe('main module', () => {
  const expectExports = (objection) => {
    expect(objection.QueryBuilderBase).toBe(QueryBuilderBase);
    expect(objection.QueryBuilderOperation).toBe(QueryBuilderOperation);
    expect(objection.RelationExpression).toBe(RelationExpression);
    expect(objection.ValidationError).toBe(ValidationError);
    expect(objection.NotFoundError).toBe(NotFoundError);
    expect(objection.Relation).toBe(Relation);
    expect(objection.HasManyRelation).toBe(HasManyRelation);
    expect(objection.HasOneRelation).toBe(HasOneRelation);
    expect(objection.BelongsToOneRelation).toBe(BelongsToOneRelation);
    expect(objection.HasOneThroughRelation).toBe(HasOneThroughRelation);
    expect(objection.ManyToManyRelation).toBe(ManyToManyRelation);
    expect(objection.transaction).toBe(transaction);
    expect(objection.transaction.start).toBe(transaction.start);
    expect(objection.ref).toBe(ref);
    expect(objection.raw).toBe(raw);
    expect(objection.val).toBe(val);
    expect(objection.mixin).toBe(mixin);
    expect(objection.compose).toBe(compose);
    expect(Object.getPrototypeOf(objection.Validator)).toBe(Validator);
    expect(Object.getPrototypeOf(objection.AjvValidator)).toBe(AjvValidator);
    expect(Object.getPrototypeOf(objection.Model)).toBe(Model);
    expect(Object.getPrototypeOf(objection.QueryBuilder)).toBe(QueryBuilder);
    expect(objection.DBError).toBe(dbErrors.DBError);
    expect(objection.UniqueViolationError).toBe(dbErrors.UniqueViolationError);
    expect(objection.ConstraintViolationError).toBe(dbErrors.ConstraintViolationError);
    expect(objection.ForeignKeyViolationError).toBe(dbErrors.ForeignKeyViolationError);
    expect(objection.NotNullViolationError).toBe(dbErrors.NotNullViolationError);
    expect(objection.CheckViolationError).toBe(dbErrors.CheckViolationError);
    expect(objection.DataError).toBe(dbErrors.DataError);
  };

  it('should be able to load using named imports', () => {
    expectExports(objectionNamespace);
  });

  it('should not have a default export', () => {
    expect(objectionNamespace).not.toHaveProperty('default');
  });

  it('should be able to load using require', () => {
    const objection = require('objection');
    expectExports(objection);
    expect(objection.Model).toBe(objectionNamespace.Model);
  });

  // Runs in a fresh process, so that only the modules that the main module
  // imports itself are loaded, not the ones that other tests import.
  for (const type of ['module', 'commonjs']) {
    it(`should load everything it needs on its own (${type})`, () => {
      const load =
        type === 'module'
          ? `import { Model } from 'objection';\nimport Knex from 'knex';`
          : `const { Model } = require('objection');\nconst Knex = require('knex');`;
      const code = `${load}
        class Person extends Model {
          static tableName = 'persons';
        }
        const query = Person.query(Knex({ client: 'pg' })).join('pets', function () {
          this.on('pets.ownerId', 'persons.id');
        });
        console.log(query.toKnexQuery().toString());`;
      const output = execFileSync(process.execPath, ['--input-type', type, '-e', code], {
        cwd: path.join(import.meta.dirname, '..'),
        encoding: 'utf8',
      });
      expect(output.trim()).toBe(
        'select "persons".* from "persons" inner join "pets" on "pets"."ownerId" = "persons"."id"',
      );
    });
  }
});
