import { describe, it, expect } from 'vitest';
import Knex from 'knex';
import { ref, Model } from 'objection';
import { ReferenceBuilder } from '../../../lib/queryBuilder/ReferenceBuilder.js';

const knex = Knex({ client: 'pg' });

function toRawArgs(ref) {
  return ref._createRawArgs(Model.query(knex));
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
    // knex drops backslashes in front of `?`, so they are written as octal
    // escapes in an escape string literal.
    expect(toRawArgs(ref(`Table.Column:["a\\?'b"]`))).toEqual([
      `??#>E'{"a\\134\\134\\?''b"}'`,
      ['Table.Column'],
    ]);
  });

  it('should keep backslashes in front of question marks in json path keys', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'Table';
      }
    }
    const { sql } = TestModel.query(Knex({ client: 'pg' }))
      .select(ref(`Table.Column:["a\\?b"]`))
      .toKnexQuery()
      .toSQL()
      .toNative();
    expect(sql).toContain(`"Table"."Column"#>E'{"a\\134\\134?b"}'`);
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

  describe('on MySQL and SQLite', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'Table';
      }
    }

    const toSql = (client, builder) =>
      builder(TestModel.query(Knex({ client, useNullAsDefault: true })))
        .toKnexQuery()
        .toString();

    it('should extract json values', () => {
      const builder = (query) =>
        query.select(ref('Table.Column:a.b[0]').as('x')).where(ref('Column:[""]'), 1);
      expect(toSql('mysql', builder)).toBe(
        'select JSON_EXTRACT(`Table`.`Column`, \'$."a"."b"[0]\') as `x` from `Table` ' +
          'where JSON_EXTRACT(`Column`, \'$.""\') = 1',
      );
      expect(toSql('sqlite3', builder)).toBe(
        'select json_extract(`Table`.`Column`, \'$."a"."b"[0]\') as `x` from `Table` ' +
          'where json_extract(`Column`, \'$.""\') = 1',
      );
    });

    it('should cast to the types of the database', () => {
      const builder = (query) =>
        query.select(
          ref('Column:a').castText(),
          ref('Column:a').castInt(),
          ref('Column:a').castBigInt(),
          ref('Column:a').castFloat(),
          ref('Column:a').castReal(),
          ref('Column:a').castDecimal(),
          ref('Column:a').castBool(),
          ref('Column:a').castTo('date'),
          ref('Column:a').castTo('char(10)'),
          ref('Column').castInt(),
          ref('Column').castText().castJson(),
          ref('Column:a').castJson(),
        );
      // MySQL casts json null to 0 or 'null', so it's turned into NULL first.
      const value = "NULLIF(JSON_EXTRACT(`Column`, '$.\"a\"'), CAST('null' AS JSON))";
      expect(toSql('mysql', builder)).toBe(
        `select JSON_UNQUOTE(${value}), ` +
          `CAST(${value} AS SIGNED), ` +
          `CAST(${value} AS SIGNED), ` +
          `CAST(${value} AS DOUBLE), ` +
          `CAST(${value} AS FLOAT), ` +
          `CAST(${value} AS DECIMAL(65,30)), ` +
          `CAST(${value} AS SIGNED), ` +
          `CAST(${value} AS date), ` +
          `CAST(JSON_UNQUOTE(${value}) AS char(10)), ` +
          'CAST(`Column` AS SIGNED), ' +
          "JSON_EXTRACT(JSON_ARRAY(CAST(`Column` AS CHAR)), '$[0]'), " +
          "JSON_EXTRACT(JSON_ARRAY(JSON_EXTRACT(`Column`, '$.\"a\"')), '$[0]') from `Table`",
      );
      expect(toSql('sqlite3', builder)).toBe(
        'select CAST(json_extract(`Column`, \'$."a"\') AS text), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS integer), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS bigint), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS float), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS real), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS decimal), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS boolean), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS date), ' +
          'CAST(json_extract(`Column`, \'$."a"\') AS char(10)), ' +
          'CAST(`Column` AS integer), ' +
          'json_quote(CAST(`Column` AS text)), ' +
          'json_quote(json_extract(`Column`, \'$."a"\')) from `Table`',
      );
    });

    it('should convert whole columns to json except on SQLite', () => {
      const builder = (query) => query.select(ref('Column').castJson());
      expect(toSql('mysql', builder)).toBe(
        "select JSON_EXTRACT(JSON_ARRAY(`Column`), '$[0]') from `Table`",
      );
      expect(() => toSql('sqlite3', builder)).toThrow(
        "ref().castJson() needs a json path or a cast on SQLite, which can't tell json columns " +
          'from text columns.',
      );
    });

    it('should escape keys in json paths', () => {
      const builder = (query) =>
        query.select(
          ref(`Column:["x') or 1=1 --"]`),
          ref('Column:["a?b"]'),
          ref("Column:['a\\\"b']"),
        );
      // MySQL writes paths with `?` or backslashes as hex literals.
      expect(toSql('mysql', builder)).toBe(
        "select JSON_EXTRACT(`Column`, '$.\"x'') or 1=1 --\"'), " +
          `JSON_EXTRACT(\`Column\`, _utf8mb4 X'${hex('$."a?b"')}'), ` +
          `JSON_EXTRACT(\`Column\`, _utf8mb4 X'${hex('$."a\\\\\\"b"')}') from \`Table\``,
      );
      expect(toSql('sqlite3', builder)).toBe(
        "select json_extract(`Column`, '$.\"x'') or 1=1 --\"'), " +
          'json_extract(`Column`, \'$."a\\u003fb"\'), ' +
          'json_extract(`Column`, \'$."a\\\\\\"b"\') from `Table`',
      );
    });
  });
});

function hex(string) {
  return Buffer.from(string).toString('hex');
}
