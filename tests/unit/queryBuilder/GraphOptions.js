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

  describe('strict', () => {
    function strictHas(options, relationPathKey, optionName, insertOnly = false) {
      return new GraphOptions({ strict: true, ...options }, insertOnly).has(
        createNode(relationPathKey),
        optionName,
      );
    }

    it('should answer the old options from the settings of the matching relations', () => {
      const relations = { a: { added: 'relate' } };
      expect(strictHas({ relations }, 'a', 'relate')).toBe(true);
      expect(strictHas({ relations }, 'a.b', 'relate')).toBe(false);
      expect(strictHas({ relations }, '', 'relate')).toBe(false);
    });

    for (const [settings, optionNames] of [
      [{ added: 'relate' }, ['relate']],
      [{ added: 'insert' }, ['insertMissing']],
      [{ added: 'relateOrInsert' }, ['relate', 'insertMissing']],
      [{ removed: 'unrelate' }, ['unrelate']],
      [{ removed: 'preserve' }, ['noDelete', 'noUnrelate']],
      [{ removed: 'delete' }, []],
      [{ kept: 'update' }, ['update']],
      [{ kept: 'preserve' }, ['noUpdate']],
      [{ kept: 'patch' }, []],
      [{ created: 'throw' }, []],
      [{ created: 'insert' }, []],
    ]) {
      it(`should translate ${JSON.stringify(settings)} to [${optionNames.join(', ')}]`, () => {
        const relations = { a: settings };

        for (const optionName of [
          'relate',
          'insertMissing',
          'unrelate',
          'noDelete',
          'noUnrelate',
          'update',
          'noUpdate',
          'noInsert',
          'noRelate',
        ]) {
          expect(strictHas({ relations }, 'a', optionName)).toBe(optionNames.includes(optionName));
        }
      });
    }

    it('should use the defaults for relations without settings', () => {
      const graphOptions = new GraphOptions({ strict: true });
      const node = createNode('a');
      expect(graphOptions.getSetting(node, 'removed')).toBe('delete');
      expect(graphOptions.getSetting(node, 'added')).toBe(undefined);
      expect(graphOptions.getSetting(node, 'kept')).toBe('patch');
      expect(graphOptions.getSetting(node, 'created')).toBe('insert');
      expect(graphOptions.shouldPatch(node)).toBe(true);
      expect(graphOptions.isStrict()).toBe(true);
      expect(new GraphOptions({}).isStrict()).toBe(false);
      expect(new GraphOptions({ strict: false }).isStrict()).toBe(false);
    });

    it('should apply the entries in order, with later entries winning', () => {
      const preserveFirst = { '*': { removed: 'preserve' }, a: { removed: 'delete' } };
      expect(strictHas({ relations: preserveFirst }, 'a', 'noDelete')).toBe(false);
      expect(strictHas({ relations: preserveFirst }, 'b', 'noDelete')).toBe(true);
      const preserveLast = { a: { removed: 'delete' }, '*': { removed: 'preserve' } };
      expect(strictHas({ relations: preserveLast }, 'a', 'noDelete')).toBe(true);
    });

    it('should override the settings of earlier entries key by key', () => {
      const relations = { '*': { removed: 'preserve' }, a: { kept: 'preserve' } };
      expect(strictHas({ relations }, 'a', 'noDelete')).toBe(true);
      expect(strictHas({ relations }, 'a', 'noUpdate')).toBe(true);
    });

    it('should apply root only to the root, and relations never to it', () => {
      const root = { kept: 'preserve' };
      expect(strictHas({ root }, '', 'noUpdate')).toBe(true);
      expect(strictHas({ root }, 'a', 'noUpdate')).toBe(false);
      expect(strictHas({ relations: { '*': { kept: 'preserve' } } }, '', 'noUpdate')).toBe(false);
      expect(strictHas({ root: { added: 'insert' } }, '', 'insertMissing')).toBe(true);
    });

    it('should answer insertGraph() with added: insert by default and never update or remove', () => {
      const relations = { a: { added: 'relate' } };
      expect(new GraphOptions({ strict: true }, true).getSetting(createNode(''), 'added')).toBe(
        'insert',
      );
      expect(strictHas({}, '', 'insertMissing', true)).toBe(true);
      expect(strictHas({}, 'b', 'insertMissing', true)).toBe(true);
      expect(strictHas({}, 'b', 'relate', true)).toBe(false);
      expect(strictHas({ relations }, 'a', 'relate', true)).toBe(true);

      for (const optionName of ['noUpdate', 'noDelete', 'noUnrelate']) {
        expect(strictHas({}, 'a', optionName, true)).toBe(true);
      }
    });

    for (const [options, message, insertOnly] of [
      [
        { strict: true, relate: true },
        '"relate" is not an option of upsertGraph() in strict mode. Valid options are: strict, root, relations, fetchStrategy, allowRefs, allowMarkers.',
      ],
      [
        { strict: true, noInsert: true },
        '"noInsert" is not an option of insertGraph() in strict mode. Valid options are: strict, root, relations, allowRefs.',
        true,
      ],
      [
        { strict: true, fetchStrategy: 'Everything' },
        '"fetchStrategy" is not an option of insertGraph() in strict mode. Valid options are: strict, root, relations, allowRefs.',
        true,
      ],
      [{ root: {} }, '"root" is not an option of upsertGraph(). Valid options are:'],
      [{ relations: {} }, '"relations" is not an option of upsertGraph(). Valid options are:'],
      [
        { strict: false, relations: {} },
        '"relations" is not an option of upsertGraph(). Valid options are:',
      ],
      [
        { strict: true, relations: { a: { gone: 'x' } } },
        '"gone" is not a setting of relations["a"] in upsertGraph(). Valid settings are: removed, added, kept, created.',
      ],
      [
        { strict: true, relations: { a: { removed: 'drop' } } },
        '"drop" is not a value of removed in relations["a"] of upsertGraph(). Valid values are: preserve, unrelate, delete.',
      ],
      [
        { strict: true, root: { removed: 'delete' } },
        '"removed" is not a setting of root in upsertGraph(). Valid settings are: added, kept, created.',
      ],
      [
        { strict: true, root: { added: 'relate' } },
        '"relate" is not a value of added in root of upsertGraph(). Valid values are: insert.',
      ],
      [
        { strict: true, relations: { 'a as b': { kept: 'update' } } },
        'invalid relation expression "a as b" in relations option: aliases like "a as b" are not supported',
      ],
      [
        { strict: true, relations: { '': { kept: 'update' } } },
        'invalid relation expression "" in relations option: the expression is empty',
      ],
      [
        { strict: true, relations: { a: { kept: 'patch' } } },
        '"kept" is not a setting of relations["a"] in insertGraph(). Valid settings are: added, created.',
        true,
      ],
      [
        { strict: true, relations: { a: { removed: 'delete' } } },
        '"removed" is not a setting of relations["a"] in insertGraph(). Valid settings are: added, created.',
        true,
      ],
      [
        { strict: true, root: { kept: 'patch' } },
        '"kept" is not a setting of root in insertGraph(). Valid settings are: added, created.',
        true,
      ],
      [
        { strict: true, relations: { a: { added: 'relateOrInsert' } } },
        '"relateOrInsert" is not a value of added in relations["a"] of insertGraph(). Valid values are: relate, insert.',
        true,
      ],
    ]) {
      it(`should throw for ${JSON.stringify(options)}${insertOnly ? ' in insertGraph()' : ''}`, () => {
        expect(() => new GraphOptions(options, insertOnly)).toThrow(message);
      });
    }

    for (const [options, message, insertOnly] of [
      [{ root: true }, 'expected root of upsertGraph() to be an object'],
      [{ root: 'x' }, 'expected root of insertGraph() to be an object', true],
      [{ relations: true }, 'expected relations of upsertGraph() to be an object'],
      [{ relations: ['a'] }, 'expected relations of upsertGraph() to be an object'],
      [{ relations: { a: true } }, 'expected relations["a"] of upsertGraph() to be an object'],
      [{ relations: { a: null } }, 'expected relations["a"] of upsertGraph() to be an object'],
    ]) {
      it(`should throw for the non-object ${JSON.stringify(options)}`, () => {
        expect(() => new GraphOptions({ strict: true, ...options }, insertOnly)).toThrow(message);
      });
    }

    it('should ignore settings that are undefined', () => {
      const relations = {
        '*': { removed: 'preserve' },
        a: { removed: undefined, gone: undefined },
      };
      expect(strictHas({ relations }, 'a', 'noDelete')).toBe(true);
    });
  });
});
