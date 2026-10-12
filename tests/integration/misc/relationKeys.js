const { Model } = require('../../../');
const { expect } = require('chai');

module.exports = (session) => {
  describe('withGraphJoined() and withGraphFetched() should tell all keys apart (#222, #223)', () => {
    const { knex } = session;
    const timestampType = session.isMySql()
      ? 'datetime(3)'
      : session.isMsSql()
        ? 'datetime2(3)'
        : 'timestamp(3)';

    // Readings within the same second, and ids with invalid UTF-8 bytes:
    const date = (ms) => new Date(Date.UTC(2026, 0, 1, 10, 0, 0, ms));
    const binaryId = (byte) => Buffer.from([...new Array(15).fill(0), byte]);

    let Person;
    let Reading;
    let Item;
    let Folder;

    before(() => {
      return knex.schema
        .dropTableIfExists('relation_keys_pets')
        .dropTableIfExists('relation_keys_persons')
        .dropTableIfExists('relation_keys_notes')
        .dropTableIfExists('relation_keys_readings')
        .dropTableIfExists('relation_keys_parts')
        .dropTableIfExists('relation_keys_items_labels')
        .dropTableIfExists('relation_keys_labels')
        .dropTableIfExists('relation_keys_items')
        .dropTableIfExists('relation_keys_files')
        .dropTableIfExists('relation_keys_folders')
        .createTable('relation_keys_persons', (table) => {
          table.binary('id', 16).primary();
          table.string('name');
        })
        .createTable('relation_keys_pets', (table) => {
          table.integer('id').primary();
          table.binary('ownerId', 16);
          table.string('name');
        })
        .createTable('relation_keys_readings', (table) => {
          table.integer('sensorId');
          table.specificType('at', timestampType);
          table.integer('value');
          table.primary(['sensorId', 'at']);
        })
        .createTable('relation_keys_notes', (table) => {
          table.integer('id').primary();
          table.integer('sensorId');
          table.specificType('at', timestampType);
          table.string('text');
        })
        .createTable('relation_keys_items', (table) => {
          table.string('a');
          table.string('b');
          table.integer('value');
          table.primary(['a', 'b']);
        })
        .createTable('relation_keys_parts', (table) => {
          table.integer('id').primary();
          table.string('a');
          table.string('b');
          table.string('name');
        })
        .createTable('relation_keys_labels', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('relation_keys_items_labels', (table) => {
          table.string('a');
          table.string('b');
          table.integer('labelId');
        })
        .createTable('relation_keys_folders', (table) => {
          table.string('id').primary();
          table.string('name');
        })
        .createTable('relation_keys_files', (table) => {
          table.integer('id').primary();
          table.string('folderId');
          table.string('name');
        });
    });

    after(() => {
      return knex.schema
        .dropTableIfExists('relation_keys_pets')
        .dropTableIfExists('relation_keys_persons')
        .dropTableIfExists('relation_keys_notes')
        .dropTableIfExists('relation_keys_readings')
        .dropTableIfExists('relation_keys_parts')
        .dropTableIfExists('relation_keys_items_labels')
        .dropTableIfExists('relation_keys_labels')
        .dropTableIfExists('relation_keys_items')
        .dropTableIfExists('relation_keys_files')
        .dropTableIfExists('relation_keys_folders');
    });

    before(() => {
      class Pet extends Model {
        static get tableName() {
          return 'relation_keys_pets';
        }
      }

      Person = class Person extends Model {
        static get tableName() {
          return 'relation_keys_persons';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: {
                from: 'relation_keys_persons.id',
                to: 'relation_keys_pets.ownerId',
              },
            },
          };
        }
      };

      class Note extends Model {
        static get tableName() {
          return 'relation_keys_notes';
        }
      }

      Reading = class Reading extends Model {
        static get tableName() {
          return 'relation_keys_readings';
        }

        static get idColumn() {
          return ['sensorId', 'at'];
        }

        static get relationMappings() {
          return {
            notes: {
              relation: Model.HasManyRelation,
              modelClass: Note,
              join: {
                from: ['relation_keys_readings.sensorId', 'relation_keys_readings.at'],
                to: ['relation_keys_notes.sensorId', 'relation_keys_notes.at'],
              },
            },
          };
        }
      };

      class Part extends Model {
        static get tableName() {
          return 'relation_keys_parts';
        }
      }

      class Label extends Model {
        static get tableName() {
          return 'relation_keys_labels';
        }
      }

      Item = class Item extends Model {
        static get tableName() {
          return 'relation_keys_items';
        }

        static get idColumn() {
          return ['a', 'b'];
        }

        static get relationMappings() {
          return {
            parts: {
              relation: Model.HasManyRelation,
              modelClass: Part,
              join: {
                from: ['relation_keys_items.a', 'relation_keys_items.b'],
                to: ['relation_keys_parts.a', 'relation_keys_parts.b'],
              },
            },
            labels: {
              relation: Model.ManyToManyRelation,
              modelClass: Label,
              join: {
                from: ['relation_keys_items.a', 'relation_keys_items.b'],
                through: {
                  from: ['relation_keys_items_labels.a', 'relation_keys_items_labels.b'],
                  to: 'relation_keys_items_labels.labelId',
                },
                to: 'relation_keys_labels.id',
              },
            },
          };
        }
      };

      class File extends Model {
        static get tableName() {
          return 'relation_keys_files';
        }
      }

      Folder = class Folder extends Model {
        static get tableName() {
          return 'relation_keys_folders';
        }

        static get relationMappings() {
          return {
            files: {
              relation: Model.HasManyRelation,
              modelClass: File,
              join: {
                from: 'relation_keys_folders.id',
                to: 'relation_keys_files.folderId',
              },
            },
          };
        }
      };

      Person.knex(knex);
      Reading.knex(knex);
      Item.knex(knex);
      Folder.knex(knex);
    });

    before(async () => {
      await knex('relation_keys_persons').insert([
        { id: binaryId(0x80), name: 'p1' },
        { id: binaryId(0x81), name: 'p2' },
      ]);
      await knex('relation_keys_pets').insert([
        { id: 1, ownerId: binaryId(0x80), name: 'pet1' },
        { id: 2, ownerId: binaryId(0x81), name: 'pet2' },
      ]);
      await knex('relation_keys_readings').insert([
        { sensorId: 1, at: date(100), value: 1 },
        { sensorId: 1, at: date(200), value: 2 },
        { sensorId: 1, at: date(300), value: 3 },
      ]);
      await knex('relation_keys_notes').insert([
        { id: 1, sensorId: 1, at: date(100), text: 'n1' },
        { id: 2, sensorId: 1, at: date(300), text: 'n3' },
      ]);
      await knex('relation_keys_items').insert([
        { a: 'a,b', b: 'c', value: 1 },
        { a: 'a', b: 'b,c', value: 2 },
      ]);
      await knex('relation_keys_parts').insert([
        { id: 1, a: 'a,b', b: 'c', name: 'part1' },
        { id: 2, a: 'a', b: 'b,c', name: 'part2' },
      ]);
      await knex('relation_keys_labels').insert([
        { id: 1, name: 'label1' },
        { id: 2, name: 'label2' },
      ]);
      await knex('relation_keys_items_labels').insert([
        { a: 'a,b', b: 'c', labelId: 1 },
        { a: 'a', b: 'b,c', labelId: 2 },
      ]);
      // Folder ids that look like the key paths of file 1:
      await knex('relation_keys_folders').insert([
        { id: 'a', name: 'folder1' },
        { id: 'a/files/k_1', name: 'folder2' },
        { id: 'a.files.k_1', name: 'folder3' },
      ]);
      await knex('relation_keys_files').insert([{ id: 1, folderId: 'a', name: 'file1' }]);
    });

    for (const method of ['withGraphJoined', 'withGraphFetched']) {
      describe(`${method}()`, () => {
        it('binary ids', async () => {
          const persons = await Person.query()
            [method]('pets')
            .orderBy('relation_keys_persons.name');

          expect(persons.map(({ name, pets }) => [name, pets.map(({ name }) => name)])).to.eql([
            ['p1', ['pet1']],
            ['p2', ['pet2']],
          ]);
        });

        it('composite ids with dates', async () => {
          const readings = await Reading.query()
            [method]('notes')
            .orderBy('relation_keys_readings.value');
          const texts = readings.map(({ value, notes }) => [value, notes.map(({ text }) => text)]);

          expect(texts).to.eql([
            [1, ['n1']],
            [2, []],
            [3, ['n3']],
          ]);
        });

        it('composite ids with commas in strings', async () => {
          const items = await Item.query()
            [method]('[parts, labels]')
            .orderBy('relation_keys_items.value');
          const names = items.map(({ value, parts, labels }) => [
            value,
            parts.map(({ name }) => name),
            labels.map(({ name }) => name),
          ]);

          expect(names).to.eql([
            [1, ['part1'], ['label1']],
            [2, ['part2'], ['label2']],
          ]);
        });

        it('string ids with separators', async () => {
          const folders = await Folder.query()[method]('files');
          const ids = folders.map(({ id, files }) => [id, files.map(({ id }) => id)]);

          expect(ids.sort()).to.eql([
            ['a', [1]],
            ['a.files.k_1', []],
            ['a/files/k_1', []],
          ]);
        });
      });
    }

    it('upsertGraph() with string ids with separators', async () => {
      await Folder.query().upsertGraph([
        { id: 'a', files: [{ id: 1 }] },
        { id: 'a.files.k_1', name: 'changed' },
      ]);

      expect(await knex('relation_keys_folders').where('id', 'a.files.k_1')).to.eql([
        { id: 'a.files.k_1', name: 'changed' },
      ]);
      expect(await knex('relation_keys_files')).to.eql([{ id: 1, folderId: 'a', name: 'file1' }]);
    });

    it('fetchGraph() with dates in composite ids', async () => {
      // SQLite returns the dates of the related rows as numbers:
      const readings = await Reading.fetchGraph(
        [1, 2, 3].map((value) => ({ sensorId: 1, at: date(value * 100), value })),
        'notes',
      );
      const texts = readings.map(({ value, notes }) => [value, notes.map(({ text }) => text)]);

      expect(texts).to.eql([
        [1, ['n1']],
        [2, []],
        [3, ['n3']],
      ]);
    });
  });
};
