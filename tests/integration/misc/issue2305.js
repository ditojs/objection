import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe('models without a primary key (idColumn = null) #2305', () => {
    const { knex } = session;
    let JobExecution;

    beforeAll(() => {
      return knex.schema
        .dropTableIfExists('job_execution')
        .createTable('job_execution', (table) => {
          table.string('name').unique();
          table.integer('runs');
        });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('job_execution');
    });

    beforeAll(() => {
      JobExecution = class JobExecution extends Model {
        static get tableName() {
          return 'job_execution';
        }

        static get idColumn() {
          return null;
        }
      };

      JobExecution.knex(knex);
    });

    beforeEach(() => {
      return knex('job_execution').delete();
    });

    const rows = () => knex('job_execution').orderBy('name');

    it('should have no id columns', () => {
      expect(JobExecution.getIdColumnArray()).toEqual([]);
      expect(JobExecution.getIdPropertyArray()).toEqual([]);
    });

    it('should have no id', () => {
      const job = JobExecution.fromJson({ name: 'a' });

      expect(job.$id()).toBeUndefined();
      expect(job.$hasId()).toBe(false);
      expect(() => job.$id(1)).toThrow('model JobExecution has no idColumn');
    });

    it('should throw a clear error for id based queries', () => {
      const job = JobExecution.fromJson({ name: 'a' });
      const message = 'model JobExecution has no idColumn';

      expect(() => JobExecution.query().findById(1).toKnexQuery()).toThrow(message);
      expect(() => JobExecution.query().findByIds([1]).toKnexQuery()).toThrow(message);
      expect(() => JobExecution.query().deleteById(1).toKnexQuery()).toThrow(message);
      expect(() => job.$query().patch({ runs: 1 }).toKnexQuery()).toThrow(message);
    });

    it('should insert a model', async () => {
      const job = await JobExecution.query().insert({ name: 'a', runs: 1 });

      expect(job).toBeInstanceOf(JobExecution);
      expect(job.toJSON()).toEqual({ name: 'a', runs: 1 });
      expect(await rows()).toEqual([{ name: 'a', runs: 1 }]);
    });

    // Only Postgres supports batch inserts.
    it.skipIf(!session.isPostgres())('should insert multiple models', async () => {
      const jobs = await JobExecution.query().insert([
        { name: 'a', runs: 1 },
        { name: 'b', runs: 2 },
      ]);

      expect(jobs.map((job) => job.toJSON())).toEqual([
        { name: 'a', runs: 1 },
        { name: 'b', runs: 2 },
      ]);
      expect(await rows()).toEqual([
        { name: 'a', runs: 1 },
        { name: 'b', runs: 2 },
      ]);
    });

    it('should insert with onConflict().ignore()', async () => {
      await JobExecution.query().insert({ name: 'a', runs: 1 });
      const job = await JobExecution.query()
        .insert({ name: 'a', runs: 2 })
        .onConflict('name')
        .ignore();

      expect(job.toJSON()).toEqual({ name: 'a', runs: 2 });
      expect(await rows()).toEqual([{ name: 'a', runs: 1 }]);
    });

    it.skipIf(session.isMySql())('should return the columns given to returning()', async () => {
      const job = await JobExecution.query().insert({ name: 'a', runs: 1 }).returning('runs');
      expect(job.runs).toBe(1);
    });

    it('should patch, update, find and delete by where clauses', async () => {
      await JobExecution.query().insert({ name: 'a', runs: 1 });

      expect(await JobExecution.query().patch({ runs: 2 }).where('name', 'a')).toBe(1);
      expect(await JobExecution.query().update({ name: 'a', runs: 3 }).where('name', 'a')).toBe(1);
      expect((await JobExecution.query().findOne({ name: 'a' })).runs).toBe(3);
      expect(await JobExecution.query().delete().where('name', 'a')).toBe(1);
      expect(await rows()).toEqual([]);
    });
  });
};
