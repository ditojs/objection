import { describe, it, expect } from 'vitest';
import { GraphOptions } from '../../../lib/queryBuilder/graph/GraphOptions.js';

describe('GraphOptions', () => {
  function createNode(relationPathKey) {
    const relationPath = relationPathKey ? relationPathKey.split('.') : [];
    return { relationPath, relationPathKey };
  }

  function matches(noInsert, relationPathKey, rootRelationPath) {
    const options = new GraphOptions({ noInsert }, rootRelationPath);
    return options._hasOption(createNode(relationPathKey), 'noInsert');
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

    it('should match the full relation path in recursive upserts', () => {
      expect(matches('a.b', 'b', ['a'])).toBe(true);
      expect(matches('a.b', '', ['a'])).toBe(false);
      expect(matches('a', '', ['a'])).toBe(true);
    });

    for (const [expression, message] of [
      ['', 'the expression is empty'],
      [' ', 'the expression is empty'],
      ['[]', 'the expression is empty'],
      ['a as b', 'aliases like "a as b" are not supported'],
      ['a.[b, c as d]', 'aliases like "c as d" are not supported'],
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

  describe('rebasedOptions', () => {
    it('should only keep the relation paths below the new root', () => {
      const options = new GraphOptions({ noInsert: ['a', 'a.b', 'ab.c', 'a.b.c', 'x.a'] });
      const rebased = options.rebasedOptions(createNode('a'));
      expect(rebased.options.noInsert).toEqual(['b', 'b.c']);
    });
  });
});
