import { describe, it, expect } from 'vitest';
import Knex from 'knex';
import { val, Model } from 'objection';
import { ValueBuilder } from '../../../lib/queryBuilder/ValueBuilder.js';

const knex = Knex({ client: 'pg' });

function toRawArgs(ref) {
  return ref._createRawArgs(Model.query(knex));
}

describe('ValueBuilder', () => {
  it('should create ValueBuilder', () => {
    let builder = val('Awwww.ItWorks');
    expect(builder).toBeInstanceOf(ValueBuilder);
    expect(toRawArgs(builder)).toEqual(['?', ['Awwww.ItWorks']]);
  });

  it('should allow casting', () => {
    let builder = val('100').castBigInt();
    expect(toRawArgs(builder)).toEqual(['CAST(? AS bigint)', ['100']]);
  });

  it('should stringify when casting to json', () => {
    let builder = val({ value: 100 }).castJson();
    expect(toRawArgs(builder)).toEqual(['CAST(? AS jsonb)', ['{"value":100}']]);
  });

  it('should expand arrays', () => {
    let builder = val([1, 2, 3]).asArray();
    expect(toRawArgs(builder)).toEqual(['ARRAY[?, ?, ?]', [1, 2, 3]]);
  });

  it('should expand undefined to an array with one value', () => {
    let builder = val(undefined).asArray();
    expect(toRawArgs(builder)).toEqual(['ARRAY[?]', [undefined]]);
  });

  it('should support aliasing', () => {
    let builder = val('Hello').as('greeting');
    expect(toRawArgs(builder)).toEqual(['? as ??', ['Hello', 'greeting']]);
  });

  it('should support simultaneous casting and aliasing', () => {
    let builder = val('1').castBigInt().as('total');
    expect(toRawArgs(builder)).toEqual(['CAST(? AS bigint) as ??', ['1', 'total']]);
  });

  it('should convert json values on MySQL and SQLite', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'Table';
      }
    }

    const toSql = (client) =>
      TestModel.query(Knex({ client, useNullAsDefault: true }))
        .where('a', val({ a: 1 }))
        .where('b', val('x').castJson())
        .where('c', val(1).castFloat())
        .toKnexQuery()
        .toString();
    expect(toSql('mysql')).toBe(
      'select `Table`.* from `Table` where `a` = CAST(\'{\\"a\\":1}\' AS JSON) ' +
        'and `b` = CAST(\'\\"x\\"\' AS JSON) and `c` = CAST(1 AS DOUBLE)',
    );
    expect(toSql('sqlite3')).toBe(
      'select `Table`.* from `Table` where `a` = json(\'{"a":1}\') ' +
        'and `b` = json(\'"x"\') and `c` = CAST(1 AS float)',
    );
  });
});
