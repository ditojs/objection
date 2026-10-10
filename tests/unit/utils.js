import { describe, it, expect } from 'vitest';
import * as classUtils from '../../lib/utils/classUtils.js';
import { delay, range } from '../../testUtils/testUtils.js';

import {
  snakeCase,
  camelCase,
  snakeCaseKeys,
  camelCaseKeys,
  snakeCaseMappers,
  knexSnakeCaseMappers,
  knexIdentifierMapping,
} from '../../lib/utils/identifierMapping.js';

import { compose, mixin } from '../../lib/utils/mixin.js';
import { map } from '../../lib/utils/promiseUtils/index.js';
import { jsonEquals, uniqBy, union } from '../../lib/utils/objectUtils.js';

describe('utils', () => {
  describe('mixin', () => {
    it('should mixin rest of the arguments to the first argument', () => {
      class X {}

      const m1 = (C) =>
        class extends C {
          f() {
            return 1;
          }
        };

      const m2 = (C) =>
        class extends C {
          f() {
            return super.f() + 1;
          }
        };

      const Y = mixin(X, m1, m2);
      const y = new Y();

      expect(y.f()).toBe(2);

      if (process.version >= 'v8.0.0') {
        expect(Y.name).toBe('X');
      }

      const Z = mixin(X, [m1, m2]);
      const z = new Z();

      expect(z.f()).toBe(2);

      if (process.version >= 'v8.0.0') {
        expect(Z.name).toBe('X');
      }
    });
  });

  describe('compose', () => {
    it('should compose multiple functions', () => {
      class X {}

      const m1 = (C) =>
        class extends C {
          f() {
            return 1;
          }
        };

      const m2 = (C) =>
        class extends C {
          f() {
            return super.f() + 1;
          }
        };

      const m3 = compose(m1, m2);
      const m4 = compose([m1, m2]);

      const Y = m3(X);
      const y = new Y();

      expect(y.f()).toBe(2);

      if (process.version >= 'v8.0.0') {
        expect(Y.name).toBe('X');
      }

      const Z = m4(X);
      const z = new Z();

      expect(z.f()).toBe(2);

      if (process.version >= 'v8.0.0') {
        expect(Z.name).toBe('X');
      }
    });
  });

  describe('snakeCase module', () => {
    describe('snakeCase and camelCase functions', () => {
      test('*', '*');

      test('foo', 'foo');
      test('fooBar', 'foo_bar');
      test('foo1Bar2', 'foo1_bar2');
      test('fooBAR', 'foo_bar', 'fooBar');
      test('fooBaR', 'foo_ba_r');

      test('föö', 'föö');
      test('fööBär', 'föö_bär');
      test('föö1Bär2', 'föö1_bär2');
      test('fööBÄR', 'föö_bär', 'fööBär');
      test('fööBäR', 'föö_bä_r');

      test('foo1bar2', 'foo1bar2');
      test('Foo', 'foo', 'foo');
      test('FooBar', 'foo_bar', 'fooBar');
      test('märkäLänttiÄäliö', 'märkä_läntti_ääliö');

      test('fooBar:spamBaz:troloLolo', 'foo_bar:spam_baz:trolo_lolo');
      test('fooBar.spamBaz.troloLolo', 'foo_bar.spam_baz.trolo_lolo');

      testUnderscoreBeforeNumbers('*', '*');

      testUnderscoreBeforeNumbers('foo', 'foo');
      testUnderscoreBeforeNumbers('fooBar', 'foo_bar');
      testUnderscoreBeforeNumbers('foo1Bar2', 'foo_1_bar_2');
      testUnderscoreBeforeNumbers('fooBAR', 'foo_bar', 'fooBar');
      testUnderscoreBeforeNumbers('fooBaR', 'foo_ba_r');

      testUnderscoreBeforeNumbers('föö', 'föö');
      testUnderscoreBeforeNumbers('fööBär', 'föö_bär');
      testUnderscoreBeforeNumbers('föö1Bär2', 'föö_1_bär_2');
      testUnderscoreBeforeNumbers('föö12Bär21', 'föö_12_bär_21');
      testUnderscoreBeforeNumbers('föö09Bär90', 'föö_09_bär_90');
      testUnderscoreBeforeNumbers('fööBÄR', 'föö_bär', 'fööBär');
      testUnderscoreBeforeNumbers('fööBäR', 'föö_bä_r');

      testUnderscoreBeforeNumbers('foo1bar2', 'foo_1bar_2');
      // Existing underscores before digits are doubled by default (kept for
      // backwards compatibility, see `noDoubleUnderscores`).
      testUnderscoreBeforeNumbers('foo_1bar_2', 'foo__1bar__2', 'foo1bar2');
      testUnderscoreBeforeNumbers('test_2_tables', 'test__2_tables', 'test2Tables');
      testUnderscoreBeforeNumbers('Foo', 'foo', 'foo');
      testUnderscoreBeforeNumbers('FooBar', 'foo_bar', 'fooBar');
      testUnderscoreBeforeNumbers('märkäLänttiÄäliö', 'märkä_läntti_ääliö');

      testUnderscoreBeforeNumbers('fooBar:spamBaz:troloLolo', 'foo_bar:spam_baz:trolo_lolo');
      testUnderscoreBeforeNumbers('fooBar.spamBaz.troloLolo', 'foo_bar.spam_baz.trolo_lolo');

      testUnderscoreBetweenUppercaseLetters('*', '*');

      testUnderscoreBetweenUppercaseLetters('foo', 'foo');
      testUnderscoreBetweenUppercaseLetters('fooBar', 'foo_bar');
      testUnderscoreBetweenUppercaseLetters('foo1Bar2', 'foo1_bar2');
      testUnderscoreBetweenUppercaseLetters('fooBAR', 'foo_b_a_r');
      testUnderscoreBetweenUppercaseLetters('fooBaR', 'foo_ba_r');

      testUnderscoreBetweenUppercaseLetters('föö', 'föö');
      testUnderscoreBetweenUppercaseLetters('fööBär', 'föö_bär');
      testUnderscoreBetweenUppercaseLetters('föö1Bär2', 'föö1_bär2');
      testUnderscoreBetweenUppercaseLetters('föö09Bär90', 'föö09_bär90');
      testUnderscoreBetweenUppercaseLetters('fööBÄR', 'föö_b_ä_r');
      testUnderscoreBetweenUppercaseLetters('fööBäR', 'föö_bä_r');

      testUnderscoreBetweenUppercaseLetters('foo1bar2', 'foo1bar2');
      testUnderscoreBetweenUppercaseLetters('Foo', 'foo', 'foo');
      testUnderscoreBetweenUppercaseLetters('FooBar', 'foo_bar', 'fooBar');
      testUnderscoreBetweenUppercaseLetters('märkäLänttiÄäliö', 'märkä_läntti_ääliö');

      testUnderscoreBetweenUppercaseLetters(
        'fooBar:spamBaz:troloLolo',
        'foo_bar:spam_baz:trolo_lolo',
      );
      testUnderscoreBetweenUppercaseLetters(
        'fooBar.spamBaz.troloLolo',
        'foo_bar.spam_baz.trolo_lolo',
      );

      test('foo_Bar', 'foo__bar', 'fooBar');

      testNoDoubleUnderscores('foo', 'foo');
      testNoDoubleUnderscores('fooBar', 'foo_bar');
      testNoDoubleUnderscores('foo_bar', 'foo_bar', 'fooBar');
      testNoDoubleUnderscores('foo_Bar', 'foo_bar', 'fooBar');
      testNoDoubleUnderscores('foo__bar', 'foo__bar', 'fooBar');
      testNoDoubleUnderscores('foo1Bar2', 'foo1_bar2');
      testNoDoubleUnderscores('foo_1', 'foo_1', 'foo1');

      testNoDoubleUnderscores('foo1Bar2', 'foo_1_bar_2', null, { underscoreBeforeDigits: true });
      testNoDoubleUnderscores('foo_1bar_2', 'foo_1bar_2', 'foo1bar2', {
        underscoreBeforeDigits: true,
      });
      testNoDoubleUnderscores('test_2_tables', 'test_2_tables', 'test2Tables', {
        underscoreBeforeDigits: true,
      });
      testNoDoubleUnderscores('foo_BAR', 'foo_b_a_r', 'fooBAR', {
        underscoreBetweenUppercaseLetters: true,
      });
      testNoDoubleUnderscores('FOO_1', 'FOO_1', 'foo1', {
        upperCase: true,
        underscoreBeforeDigits: true,
      });

      function test(camel, snake, backToCamel) {
        backToCamel = backToCamel || camel;

        it(`${camel} --> ${snake} --> ${backToCamel}`, () => {
          expect(snakeCase(camel)).toBe(snake);
          expect(snakeCaseKeys({ [camel]: 'foo' })).toEqual({ [snake]: 'foo' });

          expect(camelCase(snakeCase(camel))).toBe(backToCamel);
          expect(camelCaseKeys(snakeCaseKeys({ [camel]: 'foo' }))).toEqual({
            [backToCamel]: 'foo',
          });
        });
      }

      function testUnderscoreBeforeNumbers(camel, snake, backToCamel) {
        backToCamel = backToCamel || camel;
        const opt = { underscoreBeforeDigits: true };

        it(`${camel} --> ${snake} --> ${backToCamel}`, () => {
          expect(snakeCase(camel, opt)).toBe(snake);
          expect(camelCase(snakeCase(camel, opt), opt)).toBe(backToCamel);
        });
      }

      function testUnderscoreBetweenUppercaseLetters(camel, snake, backToCamel) {
        backToCamel = backToCamel || camel;
        const opt = { underscoreBetweenUppercaseLetters: true };

        it(`${camel} --> ${snake} --> ${backToCamel}`, () => {
          expect(snakeCase(camel, opt)).toBe(snake);
          expect(camelCase(snakeCase(camel, opt), opt)).toBe(backToCamel);
        });
      }

      function testNoDoubleUnderscores(camel, snake, backToCamel, extraOpt = {}) {
        backToCamel = backToCamel || camel;
        const opt = { noDoubleUnderscores: true, ...extraOpt };

        it(`${camel} --> ${snake} --> ${backToCamel} (${JSON.stringify(opt)})`, () => {
          expect(snakeCase(camel, opt)).toBe(snake);
          expect(camelCase(snakeCase(camel, opt), opt)).toBe(backToCamel);

          const mappers = snakeCaseMappers(opt);
          expect(mappers.format({ [camel]: 1 })).toEqual({ [snake]: 1 });

          const knexMappers = knexSnakeCaseMappers(opt);
          expect(knexMappers.wrapIdentifier(camel, (id) => id)).toBe(snake);
          expect(knexMappers.postProcessResponse({ [snake]: 1 })).toEqual({ [backToCamel]: 1 });
        });
      }
    });

    describe('snakeCaseMappers and field expressions', () => {
      it('maps json keys of field expressions by default (unchanged behaviour)', () => {
        const mappers = snakeCaseMappers();

        expect(
          mappers.format({
            'jsonCol:[0][innerKey]': 1,
            'jsonCol:someKey.otherKey': 2,
            fooBar: 3,
          }),
        ).toEqual({
          'json_col:[0][inner_key]': 1,
          'json_col:some_key.other_key': 2,
          foo_bar: 3,
        });
      });

      it('only maps the column part of field expressions with `preserveJsonKeys: true`', () => {
        const mappers = snakeCaseMappers({ preserveJsonKeys: true });

        expect(
          mappers.format({
            'jsonCol:[0][innerKey]': 1,
            'jsonCol:someKey.otherKey': 2,
            'jsonCol:[a:bC]': 3,
            'json_col:someKey': 4,
            fooBar: 5,
          }),
        ).toEqual({
          'json_col:[0][innerKey]': 1,
          'json_col:someKey.otherKey': 2,
          'json_col:[a:bC]': 3,
          'json_col:someKey': 4,
          foo_bar: 5,
        });
      });

      it('combines `preserveJsonKeys` with other options', () => {
        const mappers = snakeCaseMappers({ preserveJsonKeys: true, upperCase: true });

        expect(mappers.format({ 'jsonCol:someKey': 1, fooBar: 2 })).toEqual({
          'JSON_COL:someKey': 1,
          FOO_BAR: 2,
        });
      });

      it('`preserveJsonKeys` does not affect parse', () => {
        const mappers = snakeCaseMappers({ preserveJsonKeys: true });

        expect(mappers.parse({ foo_bar: 1, 'rel:some_prop': 2 })).toEqual(
          snakeCaseMappers().parse({ foo_bar: 1, 'rel:some_prop': 2 }),
        );
      });
    });

    describe('knex mappers and mapNestedKeys', () => {
      const date = new Date();
      const buffer = Buffer.from('foo');

      const rows = () => [
        {
          some_table: { id: 1, foo_bar: 'a', created_at: date, data_blob: buffer },
          other_table: { id: 2, some_name: null, json_col: '{"foo_bar":1}' },
          '': { row_count: 3 },
        },
      ];

      it('only maps the top level keys by default (unchanged behaviour)', () => {
        const mappers = knexSnakeCaseMappers();

        expect(mappers.postProcessResponse(rows())).toEqual([
          {
            someTable: { id: 1, foo_bar: 'a', created_at: date, data_blob: buffer },
            otherTable: { id: 2, some_name: null, json_col: '{"foo_bar":1}' },
            '': { row_count: 3 },
          },
        ]);

        expect(mappers.postProcessResponse({ json_col: { foo_bar: 1 } })).toEqual({
          jsonCol: { foo_bar: 1 },
        });
      });

      it('maps the keys of nested objects one level down with `mapNestedKeys: true`', () => {
        const mappers = knexSnakeCaseMappers({ mapNestedKeys: true });
        const [row] = mappers.postProcessResponse(rows());

        expect(row).toEqual({
          someTable: { id: 1, fooBar: 'a', createdAt: date, dataBlob: buffer },
          otherTable: { id: 2, someName: null, jsonCol: '{"foo_bar":1}' },
          '': { rowCount: 3 },
        });

        expect(row.someTable.createdAt).toBe(date);
        expect(row.someTable.dataBlob).toBe(buffer);
      });

      it('maps a single nested row with `mapNestedKeys: true`', () => {
        const mappers = knexSnakeCaseMappers({ mapNestedKeys: true });

        expect(mappers.postProcessResponse({ some_table: { foo_bar: [{ baz_qux: 1 }] } })).toEqual({
          someTable: { fooBar: [{ baz_qux: 1 }] },
        });
      });

      it('leaves flat rows and other values unchanged with `mapNestedKeys: true`', () => {
        const mappers = knexSnakeCaseMappers({ mapNestedKeys: true });

        expect(
          mappers.postProcessResponse([{ some_table_foo_bar: 1, created_at: date, tags: ['a_b'] }]),
        ).toEqual([{ someTableFooBar: 1, createdAt: date, tags: ['a_b'] }]);

        expect(mappers.postProcessResponse(1)).toBe(1);
        expect(mappers.postProcessResponse(null)).toBeNull();
      });

      it('combines `mapNestedKeys` with other options', () => {
        const mappers = knexSnakeCaseMappers({ mapNestedKeys: true, upperCase: true });

        expect(mappers.postProcessResponse([{ SOME_TABLE: { FOO_BAR: 1 } }])).toEqual([
          { someTable: { fooBar: 1 } },
        ]);
      });

      it('knexIdentifierMapping supports `mapNestedKeys` too', () => {
        const colToProp = { MyTable: 'myTable', MyProp: 'prop' };

        expect(
          knexIdentifierMapping(colToProp).postProcessResponse([{ MyTable: { MyProp: 1 } }]),
        ).toEqual([{ myTable: { MyProp: 1 } }]);

        expect(
          knexIdentifierMapping(colToProp, { mapNestedKeys: true }).postProcessResponse([
            { MyTable: { MyProp: 1 } },
          ]),
        ).toEqual([{ myTable: { prop: 1 } }]);
      });
    });
  });

  describe('promiseUtils', () => {
    describe('map', () => {
      it('should work like Promise.all if concurrency is not given', () => {
        const numItems = 20;
        let running = 0;
        let maxRunning = 0;
        let startOrder = [];

        return map(range(numItems), (item, index) => {
          startOrder.push(item);
          running++;
          maxRunning = Math.max(maxRunning, running);

          return delay(Math.round(Math.random() * 10))
            .then(() => 2 * item)
            .then((result) => {
              --running;
              return result;
            });
        }).then((result) => {
          expect(maxRunning).toBe(numItems);
          expect(result).toEqual(range(numItems).map((it) => it * 2));
          expect(startOrder).toEqual(range(numItems));
        });
      });

      it('should not start new operations after an error has been thrown', () => {
        const numItems = 20;

        let errorThrown = false;
        let callbackCalledAfterError = false;

        return map(range(numItems), (item, index) => {
          if (errorThrown) {
            callbackCalledAfterError = true;
          }

          return delay(Math.round(Math.random() * 10)).then(() => {
            if (index === 10) {
              errorThrown = true;
              throw new Error('fail');
            } else {
              return item;
            }
          });
        })
          .then(() => {
            throw new Error('should not get here');
          })
          .catch((err) => {
            expect(err.message).toBe('fail');
            expect(callbackCalledAfterError).toBe(false);
          });
      });

      it('should only run opt.concurrency operations at a time', () => {
        const concurrency = 4;
        const numItems = 20;

        let running = 0;
        let startOrder = [];

        return map(
          range(numItems),
          (item, index) => {
            startOrder.push(item);
            running++;
            expect(running).toBeLessThan(concurrency + 1);

            return delay(Math.round(Math.random() * 10))
              .then(() => 2 * item)
              .then((result) => {
                --running;
                return result;
              });
          },
          { concurrency },
        ).then((result) => {
          expect(result).toEqual(range(numItems).map((it) => it * 2));
          expect(startOrder).toEqual(range(numItems));
        });
      });

      it('should work with synchronous callbacks', () => {
        const concurrency = 4;
        const numItems = 20;
        let startOrder = [];

        return map(
          range(numItems),
          (item, index) => {
            startOrder.push(item);
            return 2 * item;
          },
          { concurrency },
        ).then((result) => {
          expect(result).toEqual(range(numItems).map((it) => it * 2));
          expect(startOrder).toEqual(range(numItems));
        });
      });
    });
  });

  describe('jsonEquals', () => {
    it('should work with primitives', () => {
      expect(jsonEquals(1, 1)).toBe(true);
      expect(jsonEquals('foo', 'foo')).toBe(true);
      expect(jsonEquals(false, false)).toBe(true);
      expect(jsonEquals(true, true)).toBe(true);
      const date = new Date();
      expect(jsonEquals(date, date)).toBe(true);
      expect(jsonEquals(date, new Date(date))).toBe(true);
      expect(jsonEquals(new Date(date), date)).toBe(true);

      expect(jsonEquals(1, 2)).toBe(false);
      expect(jsonEquals('foo', 'bar')).toBe(false);
      expect(jsonEquals(true, false)).toBe(false);
      expect(jsonEquals(0, false)).toBe(false);
      expect(jsonEquals(false, 0)).toBe(false);
      expect(jsonEquals('1', 1)).toBe(false);
      expect(jsonEquals(1, '1')).toBe(false);
      expect(jsonEquals(true, false)).toBe(false);
      expect(jsonEquals('true', true)).toBe(false);
      expect(jsonEquals(true, 'true')).toBe(false);
      expect(jsonEquals(new Date(), new Date(Date.now() + 1))).toBe(false);
    });

    it('should work with arrays', () => {
      expect(jsonEquals([], [])).toBe(true);
      expect(jsonEquals([1], [1])).toBe(true);
      expect(jsonEquals([1, 2], [1, 2])).toBe(true);
      expect(jsonEquals(['foo', 'bar'], ['foo', 'bar'])).toBe(true);

      expect(jsonEquals(['1', 2], [1, '2'])).toBe(false);
      expect(jsonEquals([1], 1)).toBe(false);
      expect(jsonEquals(2, [2])).toBe(false);
      expect(jsonEquals([0], [])).toBe(false);
      expect(jsonEquals([], [0])).toBe(false);
      expect(jsonEquals([1], [2])).toBe(false);
      expect(jsonEquals([1, 2], [2, 1])).toBe(false);
      expect(jsonEquals([1, 2], [1, 2, 3])).toBe(false);
      expect(jsonEquals([1, 2, 3], [1, 2])).toBe(false);
      expect(jsonEquals(['2', 2], [1, '2'])).toBe(false);
    });

    it('should work with objects', () => {
      expect(jsonEquals({}, {})).toBe(true);
      expect(jsonEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(jsonEquals({ a: 1, b: 2 }, { b: 2, a: 2 })).toBe(false);
      expect(jsonEquals({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 })).toBe(false);
      expect(jsonEquals({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toBe(false);
    });

    it('should work with nested stuff', () => {
      expect(
        jsonEquals(
          {
            a: [1, { b: 'foo' }, false],
          },
          {
            a: [1, { b: 'foo' }, false],
          },
        ),
      ).toBe(true);

      expect(
        jsonEquals(
          {
            a: [1, { b: 'foo' }, false],
          },
          {
            a: [1, { b: 'bar' }, false],
          },
        ),
      ).toBe(false);

      expect(
        jsonEquals(
          {
            a: [1, { b: 'foo' }, false],
          },
          {
            a: [1, { b: 'foo' }, true],
          },
        ),
      ).toBe(false);

      expect(
        jsonEquals(
          [
            {
              a: [1, { b: 'foo' }, false],
            },
            1,
          ],
          [
            {
              a: [1, { b: 'foo' }, false],
            },
            1,
          ],
        ),
      ).toBe(true);

      expect(
        jsonEquals(
          [
            {
              a: [1, { b: 'foo' }, false],
            },
            1,
          ],
          [
            {
              a: ['1', { b: 'foo' }, false],
            },
            1,
          ],
        ),
      ).toBe(false);
    });
  });
  describe('uniqBy', () => {
    const items = [
      [Buffer.from('00000000000000000000000000007AAD', 'hex')],
      [Buffer.from('00000000000000000000000000007AAE', 'hex')],
      [Buffer.from('00000000000000000000000000007AAC', 'hex')],
    ];
    it('should work with Buffer items', () => {
      const itemsForTest = items.map(([value]) => value);
      expect(uniqBy(itemsForTest)).toEqual(itemsForTest);
    });
    it('should work with Buffer[] items', () => {
      expect(uniqBy(items)).toEqual(items);
    });
    it('should work with Buffer[] items with custom keyGetter function', () => {
      expect(
        uniqBy(items, (item) =>
          item.map((x) => (Buffer.isBuffer(x) ? x.toString('hex') : x)).join(','),
        ),
      ).toEqual(items);
    });
  });

  describe('union', () => {
    it('does not keep duplicates from the first array', () => {
      expect(union([1, 1, 2], [2, 3])).toEqual([1, 2, 3]);
    });
  });
});
