import { describe, it, expect } from 'vitest';
import { GraphOptions } from '../../../lib/queryBuilder/graph/GraphOptions.js';

describe('GraphOptions', () => {
  function createNode(relationPathKey) {
    const relationPath = relationPathKey ? relationPathKey.split('.') : [];
    return { relationPath, relationPathKey };
  }

  function matches(noInsert, relationPathKey) {
    return new GraphOptions({ noInsert }).has(createNode(relationPathKey), 'noInsert');
  }

  describe('relation expressions', () => {
    for (const [expression, relationPathKey, expected] of [
      ['*', '', false],
      ['*', 'a', true],
      ['*', 'a.b.c', true],
      ['a', 'a', true],
      ['a', 'a.b', false],
      ['a.b', 'a', false],
      ['a.b', 'a.b', true],
      ['a.b', 'a.b.c', false],
      ['[p, m.r]', 'p', true],
      ['[p, m.r]', 'm', false],
      ['[p, m.r]', 'm.r', true],
      ['a.[b, c]', 'a', false],
      ['a.[b, c]', 'a.c', true],
      ['a.*', 'a', false],
      ['a.*', 'a.b', true],
      ['a.*', 'a.b.c', true],
      ['a.^', 'a', true],
      ['a.^', 'a.a.a', true],
      ['a.^', 'a.b', false],
      ['a.^2', 'a.a', true],
      ['a.^2', 'a.a.a', false],
    ]) {
      it(`'${expression}' should ${expected ? '' : 'not '}match '${relationPathKey}'`, () => {
        expect(matches(expression, relationPathKey)).toBe(expected);
      });
    }

    for (const [expression, message] of [
      ['', 'the expression is empty'],
      [' ', 'the expression is empty'],
      ['[]', 'the expression is empty'],
      ['a as b', 'aliases like "a as b" are not supported'],
      ['a.[b, c as d]', 'aliases like "c as d" are not supported'],
      ['a.[b, ^]', '"^" is only supported at the end of a relation path.'],
      ['a.[b, ^2]', '"^2" is only supported at the end of a relation path.'],
      ['[a, *]', '"*" is only supported at the end of a relation path.'],
      ['a.^.b', '"^" is only supported at the end of a relation path.'],
      ['*.a', '"*" is only supported at the end of a relation path.'],
      [
        '[a.b, a.c]',
        'Duplicate relation name "a". For example, use "a.[foo, bar]" instead of "[a.foo, a.bar]".',
      ],
    ]) {
      it(`should throw for '${expression}'`, () => {
        expect(() => new GraphOptions({ noInsert: expression })).toThrow(
          expect.objectContaining({
            message: `invalid relation expression "${expression}" in noInsert option: ${message}`,
          }),
        );
      });
    }
  });
});
