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
} from '../../lib/utils/identifierMapping.js';

import { compose, mixin } from '../../lib/utils/mixin.js';
import { map } from '../../lib/utils/promiseUtils/index.js';
import { cloneDeep, jsonEquals, uniqBy, union } from '../../lib/utils/objectUtils.js';

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
      it('maps json keys of field expressions with `preserveJsonKeys: false`', () => {
        const mappers = snakeCaseMappers({ preserveJsonKeys: false });

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

      it('only maps the column part of field expressions by default', () => {
        const mappers = snakeCaseMappers();

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

      it('combines preserving json keys with other options', () => {
        const mappers = snakeCaseMappers({ upperCase: true });

        expect(mappers.format({ 'jsonCol:someKey': 1, fooBar: 2 })).toEqual({
          'JSON_COL:someKey': 1,
          FOO_BAR: 2,
        });
      });

      it('`preserveJsonKeys` does not affect parse', () => {
        const mappers = snakeCaseMappers({ preserveJsonKeys: false });

        expect(mappers.parse({ foo_bar: 1, 'rel:some_prop': 2 })).toEqual(
          snakeCaseMappers().parse({ foo_bar: 1, 'rel:some_prop': 2 }),
        );
      });
    });

    describe('knex mappers', () => {
      it('only map the top level keys', () => {
        const date = new Date();
        const mappers = knexSnakeCaseMappers();

        expect(
          mappers.postProcessResponse([
            {
              some_table: { id: 1, foo_bar: 'a', created_at: date },
              json_col: { foo_bar: 1 },
            },
          ]),
        ).toEqual([
          {
            someTable: { id: 1, foo_bar: 'a', created_at: date },
            jsonCol: { foo_bar: 1 },
          },
        ]);
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

  describe('cloneDeep', () => {
    it('clones nested objects and arrays', () => {
      const value = { a: 1, b: { c: [1, { d: 'x' }] }, e: null };
      const clone = cloneDeep(value);

      expect(clone).toEqual(value);
      expect(clone).not.toBe(value);
      expect(clone.b).not.toBe(value.b);
      expect(clone.b.c).not.toBe(value.b.c);
      expect(clone.b.c[1]).not.toBe(value.b.c[1]);
    });

    it('keeps the prototype of class instances', () => {
      class Point {
        constructor(x) {
          this.x = x;
        }
      }

      const clone = cloneDeep({ point: new Point(1) });

      expect(clone.point).toBeInstanceOf(Point);
      expect(clone.point.x).toBe(1);
    });

    it('keeps null prototypes', () => {
      const clone = cloneDeep(Object.assign(Object.create(null), { a: 1 }));

      expect(Object.getPrototypeOf(clone)).toBeNull();
      expect(clone.a).toBe(1);
    });

    it('copies own enumerable properties, including symbols', () => {
      const symbol = Symbol('symbol');
      const value = Object.defineProperty({ a: 1, [symbol]: { b: 2 } }, 'hidden', {
        value: 3,
        enumerable: false,
      });
      const clone = cloneDeep(value);

      expect(clone[symbol]).toEqual({ b: 2 });
      expect(clone[symbol]).not.toBe(value[symbol]);
      expect(clone).not.toHaveProperty('hidden');
    });

    it('clones objects with a custom `Symbol.toStringTag`', () => {
      class Decimal {
        constructor(value) {
          this.d = [value];
        }
      }

      Decimal.prototype[Symbol.toStringTag] = 'Decimal';

      const value = {
        decimal: new Decimal(1),
        tagged: { [Symbol.toStringTag]: 'Tagged', a: { b: 1 } },
      };
      const clone = cloneDeep(value);

      expect(clone.decimal).not.toBe(value.decimal);
      expect(clone.decimal).toBeInstanceOf(Decimal);
      expect(clone.decimal.d).toEqual([1]);
      expect(clone.decimal.d).not.toBe(value.decimal.d);
      expect(clone.tagged).not.toBe(value.tagged);
      expect(clone.tagged[Symbol.toStringTag]).toBe('Tagged');
      expect(clone.tagged.a).toEqual({ b: 1 });
      expect(clone.tagged.a).not.toBe(value.tagged.a);
    });

    it('copies a `__proto__` key as a property', () => {
      const clone = cloneDeep(JSON.parse('{ "__proto__": { "x": 1 } }'));

      expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
      expect(clone.x).toBeUndefined();
      expect(Object.keys(clone)).toEqual(['__proto__']);
    });

    it('clones dates, regular expressions, maps, sets and binary data', () => {
      const key = { key: true };
      const regExp = /a+/g;
      regExp.lastIndex = 2;

      const value = {
        date: new Date(1000),
        regExp,
        map: new Map([[key, { a: 1 }]]),
        set: new Set([{ b: 2 }]),
        buffer: Buffer.from('abc'),
        typedArray: new Uint8Array([1, 2, 3]),
        arrayBuffer: new Uint8Array([4, 5]).buffer,
        dataView: new DataView(new Uint8Array([6, 7, 8]).buffer, 1, 2),
      };

      const clone = cloneDeep(value);

      expect(clone.date).not.toBe(value.date);
      expect(clone.date.getTime()).toBe(1000);
      expect(clone.regExp).not.toBe(value.regExp);
      expect(String(clone.regExp)).toBe('/a+/g');
      expect(clone.regExp.lastIndex).toBe(2);
      expect(clone.map.get(key)).toEqual({ a: 1 });
      expect(clone.map.get(key)).not.toBe(value.map.get(key));
      expect([...clone.set]).toEqual([{ b: 2 }]);
      expect([...clone.set][0]).not.toBe([...value.set][0]);
      expect(Buffer.isBuffer(clone.buffer)).toBe(true);
      expect(clone.buffer.toString()).toBe('abc');
      expect(clone.buffer).not.toBe(value.buffer);
      expect([...clone.typedArray]).toEqual([1, 2, 3]);
      expect(clone.typedArray.buffer).not.toBe(value.typedArray.buffer);
      expect([...new Uint8Array(clone.arrayBuffer)]).toEqual([4, 5]);
      expect(clone.arrayBuffer).not.toBe(value.arrayBuffer);
      expect(clone.dataView.getUint8(0)).toBe(7);
      expect(clone.dataView.byteLength).toBe(2);
      expect(clone.dataView.buffer).not.toBe(value.dataView.buffer);
    });

    it('keeps circular and shared references', () => {
      const shared = { shared: true };
      const value = { x: shared, y: [shared] };
      value.self = value;

      const clone = cloneDeep(value);

      expect(clone.self).toBe(clone);
      expect(clone.x).toBe(clone.y[0]);
      expect(clone.x).not.toBe(shared);
    });

    it("keeps values it can't clone", () => {
      const value = {
        fn() {},
        error: new Error('error'),
        typeError: new TypeError('error'),
        promise: Promise.resolve(),
        weakMap: new WeakMap(),
        weakSet: new WeakSet(),
        number: Object(1),
      };
      const clone = cloneDeep(value);

      for (const key of Object.keys(value)) {
        expect(clone[key]).toBe(value[key]);
      }
    });

    it('keeps built-ins with a non-writable `Symbol.toStringTag` as they are', () => {
      class TemporalLike {
        #value;

        constructor(value) {
          this.#value = value;
        }

        get value() {
          return this.#value;
        }

        get [Symbol.toStringTag]() {
          return 'Temporal.PlainDate';
        }
      }

      class TemporalLikeValue extends TemporalLike {}

      Object.defineProperty(TemporalLikeValue.prototype, Symbol.toStringTag, {
        value: 'Temporal.Instant',
        writable: false,
      });

      function* generator() {}

      const value = {
        url: new URL('http://example.com/path?a=1'),
        searchParams: new URLSearchParams('a=1'),
        temporalLike: new TemporalLike(1),
        temporalLikeValue: new TemporalLikeValue(2),
        dateTimeFormat: new Intl.DateTimeFormat('en'),
        generator: generator(),
      };
      const clone = cloneDeep(value);

      for (const key of Object.keys(value)) {
        expect(clone[key]).toBe(value[key]);
      }

      expect(clone.url.href).toBe('http://example.com/path?a=1');
      expect(clone.searchParams.get('a')).toBe('1');
      expect(clone.temporalLike.value).toBe(1);
      expect(clone.temporalLikeValue.value).toBe(2);
    });

    it('clones objects with an own or inherited writable `Symbol.toStringTag`', () => {
      class Decimal {
        constructor(value) {
          this.d = [value];
        }
      }

      Decimal.prototype[Symbol.toStringTag] = 'Decimal';

      const own = { [Symbol.toStringTag]: 'Own', a: { b: 1 } };
      const inherited = new Decimal(1);
      const clone = cloneDeep({ own, inherited });

      expect(clone.own).not.toBe(own);
      expect(clone.inherited).not.toBe(inherited);
      expect(clone.inherited.d).not.toBe(inherited.d);
      // The tags are left as they were.
      expect(Object.getOwnPropertySymbols(own)).toEqual([Symbol.toStringTag]);
      expect(own[Symbol.toStringTag]).toBe('Own');
      expect(Object.getOwnPropertySymbols(inherited)).toEqual([]);
      expect(inherited[Symbol.toStringTag]).toBe('Decimal');
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
