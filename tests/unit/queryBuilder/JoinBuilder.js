import { describe, it, expect } from 'vitest';
import * as objection from 'objection';
const Model = objection.Model;
import { JoinBuilder } from '../../../lib/queryBuilder/JoinBuilder.js';
import JoinClause from 'knex/lib/query/joinclause.js';

describe('JoinBuilder', () => {
  it('should have knex.JoinClause methods', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'Model';
      }
    }

    let ignore = [];

    let knexJoinClause = new JoinClause();
    let builder = JoinBuilder.forClass(TestModel);
    for (let name in knexJoinClause) {
      let func = knexJoinClause[name];
      if (typeof func === 'function' && ignore.indexOf(name) === -1) {
        expect(builder[name], `knex method '${name}' is missing from JoinBuilder`).toBeTypeOf(
          'function',
        );
      }
    }
  });
});
