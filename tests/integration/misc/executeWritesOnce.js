import { describe, it, expect, beforeEach } from 'vitest';

export default (session) => {
  describe('executing an *AndFetch() query twice', () => {
    const Model1 = session.models.Model1;

    beforeEach(() => {
      return session.populate([{ id: 1, model1Prop1: 'hello 1' }]);
    });

    it('should throw for patchAndFetchById()', async () => {
      const query = Model1.query().patchAndFetchById(1, { model1Prop2: 2 });
      await query;
      await Model1.query().patch({ model1Prop1: 'changed' }).findById(1);
      // A second run would write back the row that the first one fetched:
      await expect(query).rejects.toThrow(
        'Unable to execute patchAndFetch() twice, as the fetched row was merged into ' +
          'its patch. Create a new query for each run.',
      );
      expect(await Model1.query().findById(1)).toMatchObject({ model1Prop1: 'changed' });
    });

    it('should throw for $query().patchAndFetch()', async () => {
      const model = await Model1.query().findById(1);
      const query = model.$query().patchAndFetch({ model1Prop2: 2 });
      await query;
      await expect(query).rejects.toThrow('Create a new query for each run.');
    });

    it('should run again after a run that failed before the fetch', async () => {
      let shouldFail = true;
      const query = Model1.query()
        .context({
          runBefore() {
            if (shouldFail) {
              throw new Error('deadlock');
            }
          },
        })
        .patchAndFetchById(1, { model1Prop2: 2 });

      await expect(query).rejects.toThrow('deadlock');
      shouldFail = false;
      expect(await query).toMatchObject({ id: 1, model1Prop1: 'hello 1', model1Prop2: 2 });
    });

    it('should run patch(), delete() and finds again', async () => {
      const patch = Model1.query().patch({ model1Prop2: 2 }).findById(1);
      expect(await patch).toBe(1);
      expect(await patch).toBe(1);

      const find = Model1.query().findById(1);
      expect(await find).toMatchObject({ id: 1 });
      expect(await find).toMatchObject({ id: 1 });

      const deleteQuery = Model1.query().delete().where('model1Prop1', 'nobody');
      expect(await deleteQuery).toBe(0);
      expect(await deleteQuery).toBe(0);
    });

    it.skipIf(session.isMsSql())('should run an insert with onConflict() again', async () => {
      const query = Model1.query()
        .insert({ id: 2, model1Prop1: 'inserted' })
        .onConflict('id')
        .merge();

      await query;
      await query;
      expect(await Model1.query().findById(2)).toMatchObject({ model1Prop1: 'inserted' });
    });
  });
};
