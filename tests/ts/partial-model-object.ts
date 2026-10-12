// Type tests for PartialModelObject, the data accepted by `fetchGraph()`, and
// PartialModelRow, the data accepted by `insert()`, `patch()` and the other
// mutating methods.

import { Model, PartialModelObject, PartialModelRow, raw } from 'objection';

class Pet extends Model {
  id!: number;
  name!: string;
  meta?: any;
  tags?: any[];
  owner?: Owner;
}

class Owner extends Model {
  id!: number;
  name!: string;
  pets?: Pet[];
  partner?: Owner;
  parent?: Owner | null;
}

// Relations accept model instances and partial objects, recursively.
const a: PartialModelObject<Owner> = {
  name: 'Jennifer',
  pets: [{ name: 'Doggo', owner: { id: 1 } }],
  partner: { name: 'Sylvester' },
};

// So do nullable to-one relations, which also accept `null`.
const b: PartialModelObject<Owner> = { parent: { name: 'Arnold' } };
const c: PartialModelObject<Owner> = { parent: { pets: [{ name: 'Doggo' }] } };
const d: PartialModelObject<Owner> = { parent: null };
const e: PartialModelObject<Owner> = { parent: new Owner() };
const f: PartialModelObject<Owner> = { parent: raw('null') };

// Wrong field types are still rejected.
// @ts-expect-error
const g: PartialModelObject<Owner> = { parent: { name: 1 } };
// @ts-expect-error
const h: PartialModelObject<Owner> = { parent: { unknown: 'Arnold' } };
// @ts-expect-error
const i: PartialModelObject<Owner> = { partner: { name: 1 } };
// @ts-expect-error
const j: PartialModelObject<Owner> = { partner: null };
// @ts-expect-error
const k: PartialModelObject<Owner> = { parent: 'Arnold' };

// Rows take model instances and the properties without relations.
const l: PartialModelRow<Owner> = { id: 1, name: 'Jennifer' };
const m: PartialModelRow<Owner> = new Owner();
// @ts-expect-error
const n: PartialModelRow<Owner> = { name: 'Jennifer', pets: [] };
// @ts-expect-error
const o: PartialModelRow<Owner> = { parent: null };
// @ts-expect-error
const p: PartialModelRow<Owner> = { name: 1 };

// The mutating methods don't write relations, so they reject relation data.
async function queries() {
  await Owner.query().insert({ name: 'Jennifer' });
  await Owner.query().insert([{ name: 'Jennifer' }, new Owner()]);
  await Owner.query().patch({ name: 'Arnold' });
  await Owner.query().patch(new Owner());
  await Pet.relatedQuery('owner').for(1).relate({ id: 1 });
  await Pet.relatedQuery('owner').for(1).relate(new Owner());
  // @ts-expect-error
  await Owner.query().patch({ parent: { name: 'Arnold' } });
  // @ts-expect-error
  await Owner.query().insert({ name: 'Jennifer', parent: null });
  // @ts-expect-error
  await Owner.query().insert({ name: 'Jennifer', pets: [{ name: 'Doggo' }] });
  // @ts-expect-error
  await Owner.query().insertAndFetch([{ name: 'Jennifer', partner: new Owner() }]);
  // @ts-expect-error
  await Owner.query().update({ name: 'Jennifer', pets: [] });
  // @ts-expect-error
  await Owner.query().patchAndFetchById(1, { partner: { name: 'Arnold' } });
  // @ts-expect-error
  await Owner.query().insert({ name: 'Jennifer' }).onConflict('id').merge({ pets: [] });
  // @ts-expect-error
  await Pet.relatedQuery('owner').for(1).relate({ id: 1, pets: [] });

  // Columns typed `any`, e.g. json columns, take any value.
  await Pet.query().insert({ name: 'Doggo', meta: { a: 1 } });
  await Pet.query().patch({ meta: [1, 2] });
  await Pet.query().insert({ name: 'Doggo', tags: ['a', 1] });

  // Instances are also accepted after withGraphFetched().
  await Owner.query().withGraphFetched('pets').insert(new Owner());
  await Owner.query().withGraphFetched('pets').patch(new Owner());
  await Owner.query().withGraphFetched('pets').findById(1).patchAndFetch(new Owner());
  // @ts-expect-error a plain copy isn't an instance
  await Owner.query().patch({ ...new Owner() });

  // insertGraph() and upsertGraph() take the relations.
  await Owner.query().insertGraph({ name: 'Jennifer', pets: [{ name: 'Doggo' }] });
  await Owner.query().upsertGraph({ id: 1, parent: null });
}
