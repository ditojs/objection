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

    it.skipIf(session.isMsSql())('should insert with onConflict().ignore()', async () => {
      // knex doesn't support `onConflict()` on SQL Server.
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

    describe('as the join model of a many-to-many relation', () => {
      beforeAll(() => {
        return knex.schema
          .dropTableIfExists('job_tag')
          .dropTableIfExists('job')
          .dropTableIfExists('tag')
          .createTable('job', (table) => {
            table.integer('id').primary();
          })
          .createTable('tag', (table) => {
            table.integer('id').primary();
          })
          .createTable('job_tag', (table) => {
            table.integer('job_id');
            table.integer('tag_id');
          });
      });

      afterAll(() => {
        return knex.schema
          .dropTableIfExists('job_tag')
          .dropTableIfExists('job')
          .dropTableIfExists('tag');
      });

      beforeEach(async () => {
        await knex('job_tag').delete();
        await knex('job').delete();
        await knex('tag').delete();
        await knex('job').insert({ id: 1 });
        await knex('tag').insert([{ id: 1 }, { id: 2 }]);
      });

      class Tag extends Model {
        static tableName = 'tag';
      }

      class GetterJobTag extends Model {
        static get tableName() {
          return 'job_tag';
        }

        static get idColumn() {
          return null;
        }
      }

      class FieldJobTag extends Model {
        static tableName = 'job_tag';
        static idColumn = null;
      }

      for (const JobTag of [GetterJobTag, FieldJobTag]) {
        it(`should relate, find and unrelate with ${JobTag.name}`, async () => {
          class Job extends Model {
            static tableName = 'job';

            static relationMappings = {
              tags: {
                relation: Model.ManyToManyRelation,
                modelClass: Tag,
                join: {
                  from: 'job.id',
                  through: {
                    modelClass: JobTag,
                    from: 'job_tag.job_id',
                    to: 'job_tag.tag_id',
                  },
                  to: 'tag.id',
                },
              },
            };
          }

          const job = Job.bindKnex(knex).fromJson({ id: 1 });

          await job.$relatedQuery('tags').relate(1);
          await job.$relatedQuery('tags').relate(2);
          const tags = await job.$relatedQuery('tags').orderBy('tag.id');
          expect(tags.map((tag) => tag.id)).toEqual([1, 2]);

          expect(await job.$relatedQuery('tags').unrelate().where('tag.id', 1)).toBe(1);
          expect(await knex('job_tag')).toEqual([{ job_id: 1, tag_id: 2 }]);

          // The join model class is not modified by the relation.
          expect(JobTag.getIdColumn()).toBeNull();
        });
      }

      describe('resultSize() with withGraphJoined()', () => {
        class JobTag extends FieldJobTag {
          static relationMappings = {
            tag: {
              relation: Model.BelongsToOneRelation,
              modelClass: Tag,
              join: {
                from: 'job_tag.tag_id',
                to: 'tag.id',
              },
            },

            // The tags of the same job, including this one.
            jobTags: {
              relation: Model.HasManyRelation,
              modelClass: FieldJobTag,
              join: {
                from: 'job_tag.job_id',
                to: 'job_tag.job_id',
              },
            },
          };
        }

        const query = () => JobTag.bindKnex(knex).query();

        beforeEach(() => {
          // Without a primary key, rows can be identical.
          return knex('job_tag').insert([
            { job_id: 1, tag_id: 1 },
            { job_id: 1, tag_id: 1 },
            { job_id: 1, tag_id: 2 },
          ]);
        });

        it('should count the rows with to-one joins', async () => {
          expect(await query().withGraphJoined('tag').resultSize()).toBe(3);
        });

        it('should count no rows with to-one joins', async () => {
          await knex('job_tag').delete();
          expect(await query().withGraphJoined('tag').resultSize()).toBe(0);
        });

        it('should throw a clear error with to-many joins', async () => {
          // Each job tag joins all job tags of its job.
          try {
            await query().withGraphJoined('[tag, jobTags]').resultSize();
          } catch (err) {
            expect(err.message).toBe('model JobTag has no idColumn');
            return;
          }
          throw new Error('should not get here');
        });
      });
    });
  });
};
