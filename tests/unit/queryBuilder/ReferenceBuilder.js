import { describe, it, expect } from 'vitest';
import Knex from 'knex';
import { ref, Model } from 'objection';
import { ReferenceBuilder } from '../../../lib/queryBuilder/ReferenceBuilder.js';

function toRawArgs(ref) {
  return ref._createRawArgs(Model.query());
}

describe('ReferenceBuilder', () => {
  it('fail if reference cannot be parsed', () => {
    expect(() => {
      ref();
    }).toThrow();
    expect(() => {
      ref('');
    }).toThrow();
  });

  it('should create ReferenceBuilder', () => {
    let reference = ref('Awwww.ItWorks');
    expect(reference).toBeInstanceOf(ReferenceBuilder);
    expect(toRawArgs(reference)).toEqual(['??', ['Awwww.ItWorks']]);
  });

  it('table method should replace table', () => {
    let reference = ref('Table.Column').table('Foo');
    expect(toRawArgs(reference)).toEqual(['??', ['Foo.Column']]);
  });

  it('should allow plain knex reference + casting', () => {
    let reference = ref('Table.Column').castBigInt();
    expect(toRawArgs(reference)).toEqual(['CAST(?? AS bigint)', ['Table.Column']]);
  });

  it('should allow field expression + casting', () => {
    let reference = ref('Table.Column:jsonAttr').castBool();
    expect(toRawArgs(reference)).toEqual(["CAST(??#>>'{jsonAttr}' AS boolean)", ['Table.Column']]);
  });

  it('should allow field expression + no casting', () => {
    let reference = ref('Table.Column:jsonAttr');
    expect(toRawArgs(reference)).toEqual(["??#>'{jsonAttr}'", ['Table.Column']]);
  });

  it('should quote empty keys in field expressions', () => {
    expect(toRawArgs(ref('Table.Column:[""]'))).toEqual([`??#>'{""}'`, ['Table.Column']]);
    expect(toRawArgs(ref("Table.Column:a[''].b").castText())).toEqual([
      `CAST(??#>>'{a,"",b}' AS text)`,
      ['Table.Column'],
    ]);
  });

  it('should quote keys with special characters in field expressions', () => {
    expect(toRawArgs(ref('Table.Column:["a,b"][{c}]'))).toEqual([
      `??#>'{"a,b","{c}"}'`,
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref("Table.Column:['a\\\"b']"))).toEqual([
      `??#>'{"a\\\\\\"b"}'`,
      ['Table.Column'],
    ]);
  });

  it('should escape single quotes and question marks in json path keys', () => {
    expect(toRawArgs(ref("Table.Column:x') or 1=1 --"))).toEqual([
      `??#>'{"x'') or 1=1 --"}'`,
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:a?b').castText().as('x'))).toEqual([
      `CAST(??#>>'{a\\?b}' AS text) as ??`,
      ['Table.Column', 'x'],
    ]);
    // Backslashes are doubled inside the quoted text array element.
    expect(toRawArgs(ref(`Table.Column:["a\\'?b"]`))).toEqual([
      `??#>'{"a\\\\''\\?b"}'`,
      ['Table.Column'],
    ]);
  });

  it('should keep bindings in order when used as a column in whereIn', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'Table';
      }
    }
    const { sql, bindings } = TestModel.query(Knex({ client: 'pg' }))
      .whereIn(ref('Table.Column:a?b').castInt(), [1])
      .toKnexQuery()
      .toSQL()
      .toNative();
    expect(sql).toContain(`CAST("Table"."Column"#>>'{a?b}' AS integer) in ($1)`);
    expect(bindings).toEqual([1]);
  });

  it('should support few different casts', () => {
    expect(toRawArgs(ref('Table.Column:jsonAttr').castText())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS text)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:jsonAttr').castInt())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS integer)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:jsonAttr').castBigInt())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS bigint)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:jsonAttr').castFloat())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS float)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:jsonAttr').castDecimal())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS decimal)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:jsonAttr').castReal())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS real)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column:jsonAttr').castBool())).toEqual([
      "CAST(??#>>'{jsonAttr}' AS boolean)",
      ['Table.Column'],
    ]);
    expect(toRawArgs(ref('Table.Column').castJson())).toEqual(['to_jsonb(??)', ['Table.Column']]);
  });
});
