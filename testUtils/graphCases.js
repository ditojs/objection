import { insertRowsWithIds } from './testUtils.js';

// Generated graphs for `upsertGraph()` and `insertGraph()`: a schema with all
// kinds of relations, rows to seed it with, and a graph and options to write,
// all derived from a seed.

const prefix = 'graph_gen_';

// The columns of each table, in the order of creation:
export const graphTables = {
  person: ['id', 'label', 'name', 'age', 'parentId', 'bossId', 'favoritePetId', 'stamp'],
  pet: ['id', 'label', 'name', 'ownerId', 'stamp'],
  toy: ['id', 'label', 'name', 'petId'],
  profile: ['id', 'label', 'bio', 'personId'],
  movie: ['id', 'label', 'title'],
  person_movie: ['personId', 'movieId', 'role'],
  badge: ['kind', 'num', 'label', 'title', 'personId'],
  license: ['id', 'label', 'code'],
  person_license: ['personId', 'licenseId'],
  friendship: ['personId', 'friendId'],
};

// The foreign keys and the tables they point to:
const foreignKeys = {
  parentId: 'person',
  bossId: 'person',
  ownerId: 'person',
  petId: 'pet',
  personId: 'person',
  movieId: 'movie',
  licenseId: 'license',
  favoritePetId: 'pet',
  friendId: 'person',
};

// The relations that keep their key in the related row:
const rowKeyRelations = new Set(['children', 'pets', 'toys', 'profile', 'badges']);

const relationTypes = {
  children: 'person',
  parent: 'person',
  boss: 'person',
  owner: 'person',
  pets: 'pet',
  toys: 'toy',
  profile: 'profile',
  movies: 'movie',
  badges: 'badge',
  license: 'license',
  favoritePet: 'pet',
  siblings: 'pet',
  activeOwner: 'person',
  ownerFriends: 'person',
};

function graphTableName(table) {
  return `${prefix}${table}`;
}

export async function dropGraphTables(knex) {
  for (const table of Object.keys(graphTables).reverse()) {
    await knex.schema.dropTableIfExists(graphTableName(table));
  }
}

export async function createGraphTables(knex) {
  const t = graphTableName;
  const isMsSql = knex.client.dialect === 'mssql';

  await dropGraphTables(knex);
  await knex.schema
    .createTable(t('person'), (table) => {
      table.increments('id');
      table.string('label');
      table.string('name');
      table.integer('age');
      table.integer('parentId');
      table.integer('bossId');
      table.integer('favoritePetId');
      table.string('stamp');
    })
    .createTable(t('pet'), (table) => {
      table.increments('id');
      table.string('label');
      table.string('name');
      table.integer('ownerId');
      table.string('stamp');
    })
    .createTable(t('toy'), (table) => {
      table.increments('id');
      table.string('label');
      table.string('name');
      table.integer('petId');
    })
    .createTable(t('profile'), (table) => {
      table.increments('id');
      table.string('label');
      table.string('bio');
      table.integer('personId');
      // A HasOneRelation slot. SQL Server only allows one null in a unique key
      // without the filter:
      table.unique(['personId'], isMsSql ? { predicate: knex.whereNotNull('personId') } : {});
    })
    .createTable(t('movie'), (table) => {
      table.increments('id');
      table.string('label');
      table.string('title');
    })
    // Deletes of related rows leave the join rows to the database:
    .createTable(t('person_movie'), (table) => {
      table
        .integer('personId')
        .unsigned()
        .references('id')
        .inTable(t('person'))
        .onDelete('CASCADE');
      table.integer('movieId').unsigned().references('id').inTable(t('movie')).onDelete('CASCADE');
      table.string('role');
    })
    .createTable(t('badge'), (table) => {
      table.string('kind');
      table.integer('num');
      table.string('label');
      table.string('title');
      table.integer('personId');
      table.primary(['kind', 'num']);
    })
    .createTable(t('license'), (table) => {
      table.increments('id');
      table.string('label');
      table.string('code');
    })
    .createTable(t('person_license'), (table) => {
      table
        .integer('personId')
        .unsigned()
        .unique()
        .references('id')
        .inTable(t('person'))
        .onDelete('CASCADE');
      table
        .integer('licenseId')
        .unsigned()
        .references('id')
        .inTable(t('license'))
        .onDelete('CASCADE');
    })
    // The friends of a pet's owner, through a join table keyed on the owner.
    // SQL Server allows one cascade path per table:
    .createTable(t('friendship'), (table) => {
      table
        .integer('personId')
        .unsigned()
        .references('id')
        .inTable(t('person'))
        .onDelete('CASCADE');
      table.integer('friendId');
    });
}

export function createGraphModels(Model) {
  const t = graphTableName;

  // Stamp the rows that the hooks see written:
  class StampedModel extends Model {
    $beforeInsert() {
      this.stamp = 'insert';
    }

    $beforeUpdate() {
      this.stamp = 'update';
    }
  }

  class Person extends StampedModel {
    static get tableName() {
      return t('person');
    }

    static get relationMappings() {
      return {
        parent: {
          relation: Model.BelongsToOneRelation,
          modelClass: Person,
          join: { from: `${t('person')}.parentId`, to: `${t('person')}.id` },
        },
        children: {
          relation: Model.HasManyRelation,
          modelClass: Person,
          join: { from: `${t('person')}.id`, to: `${t('person')}.parentId` },
        },
        boss: {
          relation: Model.BelongsToOneRelation,
          modelClass: Person,
          join: { from: `${t('person')}.bossId`, to: `${t('person')}.id` },
        },
        pets: {
          relation: Model.HasManyRelation,
          modelClass: Pet,
          join: { from: `${t('person')}.id`, to: `${t('pet')}.ownerId` },
        },
        profile: {
          relation: Model.HasOneRelation,
          modelClass: Profile,
          join: { from: `${t('person')}.id`, to: `${t('profile')}.personId` },
        },
        badges: {
          relation: Model.HasManyRelation,
          modelClass: Badge,
          join: { from: `${t('person')}.id`, to: `${t('badge')}.personId` },
        },
        license: {
          relation: Model.HasOneThroughRelation,
          modelClass: License,
          join: {
            from: `${t('person')}.id`,
            through: {
              from: `${t('person_license')}.personId`,
              to: `${t('person_license')}.licenseId`,
            },
            to: `${t('license')}.id`,
          },
        },
        favoritePet: {
          relation: Model.BelongsToOneRelation,
          modelClass: Pet,
          join: { from: `${t('person')}.favoritePetId`, to: `${t('pet')}.id` },
        },
        movies: {
          relation: Model.ManyToManyRelation,
          modelClass: Movie,
          join: {
            from: `${t('person')}.id`,
            through: {
              from: `${t('person_movie')}.personId`,
              to: `${t('person_movie')}.movieId`,
              extra: ['role'],
            },
            to: `${t('movie')}.id`,
          },
        },
      };
    }
  }

  class Pet extends StampedModel {
    static get tableName() {
      return t('pet');
    }

    static get relationMappings() {
      return {
        owner: {
          relation: Model.BelongsToOneRelation,
          modelClass: Person,
          join: { from: `${t('pet')}.ownerId`, to: `${t('person')}.id` },
        },
        toys: {
          relation: Model.HasManyRelation,
          modelClass: Toy,
          join: { from: `${t('pet')}.id`, to: `${t('toy')}.petId` },
        },
        // Relations keyed on the owner's key, which a move of the pet changes:
        activeOwner: {
          relation: Model.BelongsToOneRelation,
          modelClass: Person,
          modify: (query) => query.where(`${t('person')}.age`, '>=', 30),
          join: { from: `${t('pet')}.ownerId`, to: `${t('person')}.id` },
        },
        siblings: {
          relation: Model.HasManyRelation,
          modelClass: Pet,
          join: { from: `${t('pet')}.ownerId`, to: `${t('pet')}.ownerId` },
        },
        ownerFriends: {
          relation: Model.ManyToManyRelation,
          modelClass: Person,
          join: {
            from: `${t('pet')}.ownerId`,
            through: {
              from: `${t('friendship')}.personId`,
              to: `${t('friendship')}.friendId`,
            },
            to: `${t('person')}.id`,
          },
        },
      };
    }
  }

  class Toy extends Model {
    static get tableName() {
      return t('toy');
    }
  }

  class Profile extends Model {
    static get tableName() {
      return t('profile');
    }
  }

  class Movie extends Model {
    static get tableName() {
      return t('movie');
    }
  }

  class Badge extends Model {
    static get tableName() {
      return t('badge');
    }

    static get idColumn() {
      return ['kind', 'num'];
    }
  }

  class License extends Model {
    static get tableName() {
      return t('license');
    }
  }

  return { Person, Pet, Toy, Profile, Movie, Badge, License };
}

// Seed the tables with the rows of a case, with their ids:
export async function seedGraphTables(knex, rows) {
  await knex.transaction(async (trx) => {
    for (const table of Object.keys(graphTables).reverse()) {
      await trx(graphTableName(table)).delete();
    }

    for (const [table, tableRows] of Object.entries(rows)) {
      const name = graphTableName(table);
      const hasIdentity = graphTables[table].includes('id');

      if (hasIdentity) {
        await insertRowsWithIds(trx, name, tableRows);
      } else if (tableRows.length > 0) {
        await trx(name).insert(tableRows);
      }
    }
  });
}

// Read the rows of all tables, with the ids of the rows and their foreign keys
// replaced by the labels of the rows that they point to, as the order in which
// the writes hand out ids isn't defined.
export async function dumpGraphTables(knex) {
  const rowsByTable = {};
  const labels = {};

  for (const [table, columns] of Object.entries(graphTables)) {
    rowsByTable[table] = await knex(graphTableName(table)).select(columns);

    if (columns.includes('id')) {
      labels[table] = new Map(rowsByTable[table].map((row) => [row.id, row.label]));
    }
  }

  return Object.fromEntries(
    Object.entries(rowsByTable).map(([table, rows]) => [
      table,
      rows
        .map((row) =>
          JSON.stringify(
            Object.fromEntries(
              Object.entries(row)
                .filter(([column]) => column !== 'id')
                .map(([column, value]) => [
                  column,
                  foreignKeys[column] && value !== null
                    ? (labels[foreignKeys[column]].get(value) ?? `missing:${value}`)
                    : value,
                ]),
            ),
          ),
        )
        .sort(),
    ]),
  );
}

// The labels of the rows that the graph keeps or inserts: the existing ones
// that it mentions with their ids and its new models, without `#unrelate` or
// `#delete` on them or on a model above them.
export function findKeptGraphRows(testCase) {
  const kept = [];

  const visit = (value, table, isRemoved) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, table, isRemoved));
    } else if (value && typeof value === 'object') {
      const isRemovedHere = isRemoved || !!value['#unrelate'] || !!value['#delete'];
      const id = value.id ?? value['#dbRef'];
      const row =
        !isRemovedHere &&
        (table === 'badge'
          ? testCase.rows.badge.find(
              (badge) => badge.kind === value.kind && badge.num === value.num,
            )
          : id !== undefined && testCase.rows[table].find((other) => other.id === id));

      if (row) {
        kept.push([table, row.label]);
      } else if (!isRemovedHere && value.label !== undefined) {
        kept.push([table, value.label]);
      }

      for (const [key, child] of Object.entries(value)) {
        if (relationTypes[key]) {
          visit(child, relationTypes[key], isRemovedHere);
        }
      }
    }
  };

  visit(testCase.graph, 'person', false);
  return kept;
}

// Create the rows of the database and the call that writes a graph from
// `seed`. Each existing row appears once in the graph, apart from rows that get
// a second place, which agrees with the first one unless the case is built to
// conflict (`isConflicting`).
export function createGraphCase(seed) {
  const random = createRandom(seed);
  const rows = createRows(random);
  const isInsert = random.chance(0.2);
  const uidNodes = [];
  const usedIds = new Set();
  let labelCount = 0;
  let uidCount = 0;
  let hasMarkers = false;
  let isConflicting = false;
  // The pets that list the pets of their owner as `siblings`:
  const siblingsPlaces = [];
  // Values that rows have to get from the graph, by table and label:
  const expectedValues = [];
  // Graphs that move rows or insert badges, which have their ids, mostly come
  // with the options that they need:
  let hasMovedRows = false;
  let hasNewBadges = false;

  const newLabel = (type) => `${type}-new${++labelCount}`;
  const unused = (type, rows) => rows.filter((row) => !usedIds.has(`${type}:${row.id}`));
  const use = (type, obj) => {
    usedIds.add(`${type}:${obj.id ?? obj['#dbRef']}`);
    return obj;
  };

  // The place of each model whose relation keeps a key in its row, which other
  // places of its row have to share:
  const keyPlaces = new Map();
  const isRowKeyPlace = (place) => rowKeyRelations.has(place?.key);

  // Give models a `#id`, which `#ref` and `#ref{}` point to later:
  const setUid = (obj, type) => {
    obj['#id'] = `u${++uidCount}`;
    uidNodes.push({ obj, type });
    return obj['#id'];
  };

  // A model in a BelongsToOneRelation that puts the model at `place` where
  // `place` already puts it, or deliberately somewhere else:
  const createContainerRef = (place) => {
    if (random.chance(0.2)) {
      // The `#id` keeps `#ref` models from replacing it:
      const model = { label: newLabel('person') };
      setUid(model, 'person');
      isConflicting = true;
      return model;
    } else {
      return { '#ref': place.container['#id'] ?? setUid(place.container, 'person') };
    }
  };

  // A model of `type` from its place, from elsewhere in the database, or a new
  // one:
  const createModel = (type, allRows, depth, place, allOwnRows = [], allowsDbRef = false) => {
    const roll = random.int(0, 9);
    const existingRows = unused(type, allRows);
    const ownRows = unused(type, allOwnRows);

    if (!isInsert && ownRows.length > 0 && roll < 4) {
      return createObject(type, use(type, { id: random.pick(ownRows).id }), depth, place);
    } else if (!isInsert && existingRows.length > 0 && roll < 6) {
      hasMovedRows = true;
      return createObject(type, use(type, { id: random.pick(existingRows).id }), depth, place);
    } else if (
      allowsDbRef &&
      existingRows.length > 0 &&
      roll < 7 &&
      random.chance(isInsert ? 0.6 : 0.3)
    ) {
      return use(type, { '#dbRef': random.pick(existingRows).id });
    } else {
      return createObject(type, { label: newLabel(type) }, depth, place);
    }
  };

  const createArray = (type, allRows, depth, place, ownRows, allowsDbRef) =>
    Array.from({ length: random.int(0, 3) }, () =>
      createModel(type, allRows, depth + 1, place, ownRows, allowsDbRef),
    );

  const createObject = (type, obj, depth, place = null) => {
    if (random.chance(0.25)) setUid(obj, type);
    if (isRowKeyPlace(place)) keyPlaces.set(obj, place);
    const at = (key) => ({ container: obj, key });
    const ownRows = (table, key) =>
      obj.id ? rows[table].filter((row) => row[key] === obj.id) : [];

    // Mark some related models at their place for removal:
    if (obj.id && depth > 0 && random.chance(0.05)) {
      hasMarkers = true;
      obj[random.chance(0.5) ? '#unrelate' : '#delete'] = true;
    }

    if (type === 'person') {
      if (random.chance(0.5)) obj.name = `name ${random.int(1, 99)}`;
      if (random.chance(0.3)) obj.age = random.int(1, 90);

      if (depth < 3) {
        if (random.chance(0.4)) {
          obj.children = createArray(
            'person',
            rows.person,
            depth,
            at('children'),
            ownRows('person', 'parentId'),
          );
        }
        if (random.chance(0.4)) {
          obj.pets = createArray('pet', rows.pet, depth, at('pets'), ownRows('pet', 'ownerId'));
          // Relations of one pet that are keyed on its owner, which change when
          // the pet moves here:
          const pet = random.chance(0.3) && random.pick(obj.pets.filter((pet) => !isMarked(pet)));
          if (pet) {
            // `insertGraph()` can't relate the pets of `siblings`:
            if (!isInsert && random.chance(0.6)) {
              siblingsPlaces.push({ owner: obj, pet });
            }
            if (random.chance(0.4)) {
              const ownFriends = ownRows('friendship', 'personId').map((row) => ({
                id: row.friendId,
              }));
              pet.ownerFriends = createArray(
                'person',
                rows.person,
                depth + 1,
                { container: pet, key: 'ownerFriends' },
                ownFriends,
                true,
              );
            }
          }
        }
        if (random.chance(0.25)) {
          obj.boss = random.chance(0.2)
            ? null
            : createModel('person', rows.person, depth + 1, at('boss'), [], true);
        }
        if (random.chance(0.25)) {
          obj.profile = random.chance(0.2)
            ? null
            : createModel(
                'profile',
                rows.profile,
                depth + 1,
                at('profile'),
                ownRows('profile', 'personId'),
              );
        }
        if (random.chance(0.25)) {
          obj.badges = Array.from({ length: random.int(0, 2) }, () => {
            const own = ownRows('badge', 'personId').filter(
              (badge) => !usedIds.has(`badge:${badge.kind},${badge.num}`),
            );
            const badge = !isInsert && own.length > 0 && random.chance(0.6) && random.pick(own);

            if (badge) {
              usedIds.add(`badge:${badge.kind},${badge.num}`);
              return {
                kind: badge.kind,
                num: badge.num,
                ...(random.chance(0.5) && { title: `title ${random.int(1, 9)}` }),
              };
            } else {
              hasNewBadges = true;
              return { kind: 'n', num: ++labelCount, label: newLabel('badge') };
            }
          });
        }
        if (random.chance(0.15)) {
          const ownLicenses = ownRows('person_license', 'personId').map((row) => ({
            id: row.licenseId,
          }));
          obj.license = random.chance(0.2)
            ? null
            : createModel('license', rows.license, depth + 1, at('license'), ownLicenses, true);
        }
        if (random.chance(0.3)) {
          const ownMovies = ownRows('person_movie', 'personId').map((row) => ({
            id: row.movieId,
          }));
          obj.movies = createArray('movie', rows.movie, depth, at('movies'), ownMovies, true).map(
            (movie) => {
              if (!movie['#dbRef'] && random.chance(0.5)) movie.role = `role ${random.int(1, 9)}`;
              return movie;
            },
          );
        }
        // A pet that the graph may leave out of its owner's `pets`, which
        // then keeps it here:
        if (random.chance(0.1)) {
          obj.favoritePet = createModel('pet', rows.pet, depth + 1, at('favoritePet'), [], true);
        }
        // Below `children`, the parent is the model that lists the child:
        if (random.chance(0.1) && !isMarked(obj) && !place?.container['#delete']) {
          obj.parent =
            place?.key === 'children'
              ? createContainerRef(place)
              : random.chance(0.3)
                ? null
                : createModel('person', rows.person, depth + 1, at('parent'), [], true);
        }
      }
    } else if (type === 'pet') {
      if (random.chance(0.5)) obj.name = `name ${random.int(1, 99)}`;

      if (depth < 3) {
        if (random.chance(0.3)) {
          obj.toys = createArray('toy', rows.toy, depth, at('toys'), ownRows('toy', 'petId'));
        }
        // Below `pets`, the owner is the model that lists the pet:
        const isInPets = place.key === 'pets';
        if (random.chance(0.1) && !isMarked(obj) && !(isInPets && place.container['#delete'])) {
          const ownerKey = random.chance(0.7) ? 'owner' : 'activeOwner';
          obj[ownerKey] = isInPets
            ? createContainerRef(place)
            : createModel('person', rows.person, depth + 1, at(ownerKey), [], true);
        }
      }
    } else if (type === 'toy') {
      if (random.chance(0.5)) obj.name = `name ${random.int(1, 99)}`;
    } else if (type === 'profile') {
      if (random.chance(0.5)) obj.bio = `bio ${random.int(1, 99)}`;
    } else if (type === 'movie') {
      if (random.chance(0.3)) obj.title = `title ${random.int(1, 99)}`;
    } else if (type === 'license') {
      if (random.chance(0.3)) obj.code = `code ${random.int(1, 99)}`;
    }

    return obj;
  };

  const roots = Array.from({ length: random.int(1, 2) }, () =>
    isInsert
      ? createObject('person', { label: newLabel('person') }, 0)
      : createModel('person', rows.person, 0, null, rows.person),
  ).filter((root) => !root['#dbRef']);

  if (roots.length === 0) {
    roots.push(createObject('person', { label: newLabel('person') }, 0));
  }

  // Replace some models with a `#ref` to a model of the same type. A place
  // that keeps a key in the row only takes models that don't set it elsewhere:
  const replaceWithRefs = (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      const place = { container: obj, key };
      // The roles that this place gives the join rows of its models:
      const rolesHere = new Map();

      const replace = (item) => {
        const candidates = uidNodes.filter(({ obj: model, type }) => {
          const keyPlace = keyPlaces.get(model);
          return (
            type === relationTypes[key] &&
            !model['#delete'] &&
            !contains(item, model) &&
            (!isRowKeyPlace(place) ||
              (!isMarked(model) &&
                !(key === 'children' && 'parent' in model) &&
                !(key === 'pets' && ('owner' in model || 'activeOwner' in model)) &&
                (!keyPlace || (keyPlace.container === obj && keyPlace.key === key))))
          );
        });

        if (candidates.length > 0 && !hasUid(item) && !item['#ref'] && random.chance(0.15)) {
          const model = random.pick(candidates).obj;
          // Join rows of `#ref` models may have extras of their own. A pair of
          // models has one join row, which conflicts with a second role:
          const role = key === 'movies' && random.chance(0.5) && `role ${random.int(1, 9)}`;
          if (role) {
            const otherRole =
              rolesHere.get(model) ?? (value.includes(model) ? model.role : undefined);
            isConflicting ||= otherRole !== undefined && otherRole !== role;
            rolesHere.set(model, otherRole ?? role);
          }
          // A pair that its model's place unrelates and the `#ref` keeps conflicts:
          isConflicting ||=
            ['movies', 'ownerFriends'].includes(key) && isMarked(model) && value.includes(model);
          if (isRowKeyPlace(place)) keyPlaces.set(model, place);
          return { '#ref': model['#id'], ...(role && { role }) };
        } else {
          replaceWithRefs(item);
          return item;
        }
      };

      if (Array.isArray(value)) {
        obj[key] = value.map(replace);
      } else if (value && typeof value === 'object') {
        obj[key] = replace(value);
      }
    }
  };

  for (const root of roots) {
    replaceWithRefs(root);
  }

  // `siblings` describe the same pets as the final `pets` of their owner, so
  // they list them all:
  for (const { owner, pet } of siblingsPlaces) {
    pet.siblings = owner.pets
      .filter((sibling) => !isMarked(sibling))
      .map((sibling) => ({ '#ref': sibling['#ref'] ?? sibling['#id'] ?? setUid(sibling, 'pet') }));
  }

  // Point some names to the names of other models with `#ref{}`:
  const namedUidNodes = uidNodes.filter(
    (node) => node.obj.name !== undefined && roots.some((root) => contains(root, node.obj)),
  );

  for (const node of uidNodes) {
    const target = namedUidNodes.length > 0 && random.pick(namedUidNodes);

    if (target && target !== node && node.obj.name !== undefined && random.chance(0.15)) {
      node.obj.name = `ref #ref{${target.obj['#id']}.name}`;
    }
  }

  // Give some rows that the graph doesn't contain yet a second place, which
  // either agrees with the first one or conflicts with it, as such graphs have
  // to be rejected:
  const unusedPersons = unused('person', rows.person);
  const hasSecondPlace = !isInsert && unusedPersons.length > 0 && random.chance(0.2);

  if (hasSecondPlace) {
    const person = use('person', { id: random.pick(unusedPersons).id });
    const other = () => random.pick(rows.person).id;
    const pets = unused('pet', rows.pet);
    const profiles = unused('profile', rows.profile);
    const shape = random.int(0, 2);

    if (shape === 0) {
      // A foreign key prop in one place, the relation in another:
      const bossId = other();
      const otherBossId = random.chance(0.5) ? bossId : other();
      isConflicting ||= otherBossId !== bossId;
      roots.push({ id: person.id, boss: { id: bossId } }, { id: person.id, bossId: otherBossId });
    } else if (shape === 1 && pets.length > 0) {
      // A foreign key prop next to the relation that sets it, which follows
      // the relation, e.g. the old key of a fetched model:
      const pet = random.pick(pets);
      roots.push({ id: person.id, pets: [{ ...use('pet', { id: pet.id }), ownerId: other() }] });
      const { label } = rows.person.find((row) => row.id === person.id);
      expectedValues.push(['pet', pet.label, { ownerId: label }]);
    } else {
      // Two rows for one HasOneRelation slot:
      const profile = () =>
        profiles.length > 0 && random.chance(0.7)
          ? { id: random.pick(profiles).id }
          : { label: newLabel('profile') };
      const first = profile();
      const second = random.chance(0.4) ? { ...first } : profile();
      isConflicting ||= !first.id || second.id !== first.id;
      roots.push({ id: person.id, profile: first }, { id: person.id, profile: second });
    }
  }

  const options = { allowRefs: true, ...(hasMarkers && { allowMarkers: true }) };
  const optionNames = isInsert
    ? ['relate']
    : [
        'relate',
        'unrelate',
        'insertMissing',
        'noDelete',
        'noUpdate',
        'noInsert',
        'noRelate',
        'noUnrelate',
        'update',
      ];
  const paths = [
    'children',
    'pets',
    'boss',
    'profile',
    'movies',
    'badges',
    'license',
    'children.pets',
    'boss.children',
    'pets.toys',
  ];

  for (const name of optionNames) {
    if (random.chance(name === 'relate' ? 0.6 : 0.2)) {
      // Some options name relation paths instead of applying everywhere:
      options[name] = random.chance(0.3)
        ? [...new Set(Array.from({ length: random.int(1, 2) }, () => random.pick(paths)))]
        : true;
    }
  }

  if ((hasMovedRows && random.chance(0.85)) || hasSecondPlace) options.relate = true;
  // `#ref` models and their models may be written through paths that allow
  // different writes:
  if (!isInsert && /"#ref"/.test(JSON.stringify(roots)) && random.chance(0.3)) {
    options.noUpdate = [random.pick(paths)];
  }
  if (hasNewBadges && !isInsert && random.chance(0.85)) options.insertMissing = true;

  if (!isInsert && random.chance(0.3)) {
    options.fetchStrategy = random.pick(['OnlyIdentifiers', 'OnlyNeeded', 'Everything']);
  }

  return {
    seed,
    rows,
    method: isInsert ? 'insertGraph' : 'upsertGraph',
    graph: roots.length === 1 ? roots[0] : roots,
    options,
    isConflicting,
    // `noRelate` leaves the rows where they are:
    expectedValues: options.noRelate ? [] : expectedValues,
  };
}

function createRows(random) {
  const rows = Object.fromEntries(Object.keys(graphTables).map((table) => [table, []]));
  const personCount = random.int(2, 5);

  for (let id = 1; id <= personCount; id++) {
    rows.person.push({
      id,
      label: `p${id}`,
      name: `person ${id}`,
      age: random.int(1, 90),
      parentId: id > 1 && random.chance(0.5) ? random.int(1, id - 1) : null,
      bossId: random.chance(0.3) ? random.int(1, personCount) : null,
    });
  }

  for (const person of rows.person) {
    for (let i = random.int(0, 2); i > 0; i--) {
      const id = rows.pet.length + 1;
      rows.pet.push({ id, label: `pet${id}`, name: `pet ${id}`, ownerId: person.id });

      for (let j = random.int(0, 1); j > 0; j--) {
        const toyId = rows.toy.length + 1;
        rows.toy.push({ id: toyId, label: `toy${toyId}`, name: `toy ${toyId}`, petId: id });
      }
    }

    if (random.chance(0.4)) {
      const id = rows.profile.length + 1;
      rows.profile.push({ id, label: `prof${id}`, bio: `bio ${id}`, personId: person.id });
    }
  }

  for (let id = 1; id <= 3; id++) {
    rows.movie.push({ id, label: `m${id}`, title: `movie ${id}` });
    rows.license.push({ id, label: `l${id}`, code: `code ${id}` });
  }

  for (const person of rows.person) {
    for (let i = random.int(0, 2); i > 0; i--) {
      const num = rows.badge.length + 1;
      rows.badge.push({
        kind: 'b',
        num,
        label: `b${num}`,
        title: `badge ${num}`,
        personId: person.id,
      });
    }

    if (random.chance(0.4)) {
      rows.person_license.push({ personId: person.id, licenseId: random.int(1, 3) });
    }

    if (rows.pet.length > 0 && random.chance(0.3)) {
      person.favoritePetId = random.pick(rows.pet).id;
    }

    for (const friend of rows.person) {
      if (friend !== person && random.chance(0.2)) {
        rows.friendship.push({ personId: person.id, friendId: friend.id });
      }
    }

    for (const movie of rows.movie) {
      if (random.chance(0.3)) {
        rows.person_movie.push({
          personId: person.id,
          movieId: movie.id,
          role: `role ${movie.id}`,
        });
      }
    }
  }

  return rows;
}

// mulberry32, a small seeded generator:
function createRandom(seed) {
  let state = seed >>> 0 || 1;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

function contains(value, target) {
  return (
    value === target ||
    (value !== null &&
      typeof value === 'object' &&
      Object.values(value).some((child) => contains(child, target)))
  );
}

function isMarked(obj) {
  return !!obj['#unrelate'] || !!obj['#delete'];
}

function hasUid(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    (Object.hasOwn(value, '#id') || Object.values(value).some(hasUid))
  );
}
