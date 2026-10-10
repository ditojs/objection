const expect = require('expect.js');
const { GraphOptions } = require('../../../lib/queryBuilder/graph/GraphOptions');

describe('GraphOptions', () => {
  function createNode(relationPathKey) {
    const relationPath = relationPathKey ? relationPathKey.split('.') : [];
    return { relationPath, relationPathKey };
  }

  describe('rebasedOptions', () => {
    it('should only keep the relation paths below the new root', () => {
      const options = new GraphOptions({ noInsert: ['a', 'a.b', 'ab.c', 'a.b.c', 'x.a'] });
      const rebased = options.rebasedOptions(createNode('a'));
      expect(rebased.options.noInsert).to.eql(['b', 'b.c']);
    });
  });
});
