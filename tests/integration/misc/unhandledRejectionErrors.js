import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

export default (session) => {
  // Tests that various queries that start multiple queries behind the scenes
  // don't cause unhandled rejection errors if one of the queries fail.
  describe('unhandler rejection errors', () => {
    const Model1 = session.models.Model1;

    let unhandledErrors = [];

    const unhandledRejectionHandler = (err) => {
      unhandledErrors.push(err);
    };

    beforeAll(() => {
      process.on('unhandledRejection', unhandledRejectionHandler);
    });

    afterAll(() => {
      process.off('unhandledRejection', unhandledRejectionHandler);
    });

    beforeEach(() => {
      unhandledErrors = [];
    });

    beforeEach(() => {
      return session.populate([
        {
          model1Prop1: '1',

          model1Relation1: {
            model1Prop1: '3',
          },

          model1Relation2: [
            {
              model2Prop1: '1',
            },
          ],
        },
        {
          model1Prop1: '2',

          model1Relation1: {
            model1Prop1: '4',
          },

          model1Relation2: [
            {
              model2Prop1: '2',
            },
          ],
        },
      ]);
    });

    it('range', async () => {
      await expect(Model1.query().table('doesnt_exist').range(1, 2)).rejects.toThrow();
      expect(unhandledErrors).toHaveLength(0);
    });
  });
};
