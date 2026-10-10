import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Model } from 'objection';

export default (session) => {
  describe(`patch() breaks if useDefineForClassField is enabled in tsconfig #2105`, () => {
    let knex = session.knex;
    let Person;

    beforeAll(() => {
      return knex.schema.dropTableIfExists('persons').createTable('persons', (table) => {
        table.increments('id').primary();
        table.string('firstName');
        table.string('lastName');
      });
    });

    afterAll(() => {
      return knex.schema.dropTableIfExists('persons');
    });

    beforeAll(() => {
      Person = class Person extends Model {
        constructor() {
          super(...arguments);
          Object.defineProperty(this, 'firstName', {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0,
          });
          Object.defineProperty(this, 'lastName', {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0,
          });
        }

        static get tableName() {
          return 'persons';
        }
      };

      Person.knex(knex);
    });

    beforeEach(() => {
      return Person.query().insert({ firstName: 'John', lastName: 'Doe' });
    });
    afterEach(() => Person.query().delete());

    it('should not override lastName with undefined', () => {
      return Person.query()
        .where('lastName', 'Doe')
        .first()
        .then((person) => {
          return person
            .$query()
            .patch({ firstName: 'Jane' })
            .then(() => person);
        })
        .then((person) => {
          expect(person.firstName).toBe('Jane');
          expect(person.lastName).toBe('Doe');
        });
    });

    it('should still set values to undefined if explicitly told to do so', () => {
      return Person.query()
        .where('lastName', 'Doe')
        .first()
        .then((person) => {
          return person.$set({ lastName: undefined });
        })
        .then((person) => {
          expect(person.firstName).toBe('John');
          expect(person.lastName).toBeUndefined();
        });
    });
  });
};
