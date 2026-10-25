// Type tests for the options of strict insertGraph() and upsertGraph(): the
// old options and the strict ones can't be mixed.

import {
  GraphSettings,
  InsertGraphOptions,
  InsertGraphSettings,
  StrictInsertGraphOptions,
  StrictUpsertGraphOptions,
  UpsertGraphOptions,
} from 'objection';
import { Person } from './fixtures/person.js';

type AnyUpsertGraphOptions = UpsertGraphOptions | StrictUpsertGraphOptions;
type AnyInsertGraphOptions = InsertGraphOptions | StrictInsertGraphOptions;

async function strictOptions() {
  await Person.query().upsertGraph(
    { id: 1 },
    {
      strict: true,
      root: { kept: 'preserve', added: 'insert' },
      relations: {
        '*': { removed: 'preserve' },
        movies: { added: 'relateOrInsert', kept: 'update' },
        'movies.reviews': { removed: 'delete', created: 'throw' },
      },
      allowRefs: true,
      allowMarkers: true,
      fetchStrategy: 'OnlyNeeded',
    },
  );
  await Person.query().insertGraph(
    { firstName: 'Jennifer' },
    { strict: true, root: { created: 'insert' }, relations: { pets: { added: 'relate' } } },
  );
  await Person.query().insertGraph(
    { id: 1 },
    { strict: true, root: { added: 'throw' }, relations: { '*': { added: 'throw' } } },
  );
  await Person.query().upsertGraph(
    { id: 1 },
    {
      strict: true,
      root: { added: 'throw' },
      relations: { '*': { added: 'relate', removed: 'unrelate' }, pets: { added: 'throw' } },
    },
  );
  await Person.query().upsertGraph({ id: 1 }, { strict: false, relate: true });
  await Person.query().upsertGraph({ id: 1 }, { fetchStrategy: 'OnlyIdentifiers' });
  await Person.query().insertGraph({ firstName: 'Jennifer' }, { relate: true });

  // @ts-expect-error The old options don't take strict: true.
  const mixed: AnyUpsertGraphOptions = { strict: true, relate: true };
  // @ts-expect-error relations needs strict: true.
  const withoutStrict: AnyUpsertGraphOptions = { relations: {} };
  // @ts-expect-error root rows are never removed.
  const removedRoot: AnyUpsertGraphOptions = { strict: true, root: { removed: 'delete' } };
  const keptInsert: AnyInsertGraphOptions = {
    strict: true,
    // @ts-expect-error insertGraph() doesn't update rows.
    relations: { pets: { kept: 'patch' } },
  };
  const relateOrInsert: AnyInsertGraphOptions = {
    strict: true,
    // @ts-expect-error insertGraph() doesn't load rows.
    relations: { pets: { added: 'relateOrInsert' } },
  };
  // @ts-expect-error insertGraph() doesn't fetch rows.
  const fetchInsert: AnyInsertGraphOptions = { strict: true, fetchStrategy: 'OnlyNeeded' };

  return [mixed, withoutStrict, removedRoot, keptInsert, relateOrInsert, fetchInsert];
}

strictOptions();

function graphSettings() {
  const upsert: GraphSettings = Person.getGraphSettings(
    'pets',
    { strict: true, relations: { pets: { removed: 'delete' } } },
    'upsert',
  );
  const removed: 'preserve' | 'unrelate' | 'delete' | undefined = upsert.removed;
  const added: 'relate' | 'insert' | 'relateOrInsert' | 'throw' = upsert.added;
  const insert: InsertGraphSettings = Person.getGraphSettings(['pets'], { strict: true }, 'insert');
  const kept: 'preserve' = insert.kept;
  // @ts-expect-error insertGraph() doesn't take the options of upsertGraph().
  Person.getGraphSettings('pets', { strict: true, fetchStrategy: 'OnlyNeeded' }, 'insert');
  // @ts-expect-error The settings are only resolved for strict mode.
  Person.getGraphSettings('pets', { relate: true }, 'upsert');

  return [removed, added, kept];
}

graphSettings();
