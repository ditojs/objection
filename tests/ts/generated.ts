import {
  Generated,
  Insertable,
  InsertableGraph,
  Model,
  ModelObject,
  PartialModelGraph,
  PartialModelObject,
  raw,
} from 'objection';

class Pet extends Model {
  id!: Generated<number>;
  name!: string;
  ownerId!: number;
  owner?: Owner | null;
}

class Owner extends Model {
  id!: Generated<number>;
  createdAt!: Generated<Date>;
  active!: Generated<boolean>;
  nickname!: Generated<string> | null;
  firstName!: string;
  lastName?: string;
  middleName!: string | null;
  pets?: Pet[];

  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

async function readGenerated() {
  const owner = await Owner.query().findById(1).throwIfNotFound();

  // Generated properties read like the underlying type.
  const id: number = owner.id;
  const createdAt: Date = owner.createdAt;
  const active: boolean = owner.active;
  const nickname: string | null = owner.nickname;
  const next: number = owner.id + 1;
  const isFirst: boolean = owner.id === 1 || owner.id < 2;
  createdAt.getTime();

  // And they accept the underlying type.
  owner.id = 2;
  owner.createdAt = new Date();
  owner.nickname = null;

  const object: ModelObject<Owner> = owner;
  const objectId: number = object.id;

  // @ts-expect-error a generated number is still a number
  owner.id = 'one';
}

async function insertable() {
  const minimal: Insertable<Owner> = { firstName: 'Jennifer', middleName: null };
  const full: Insertable<Owner> = {
    id: 1,
    createdAt: new Date(),
    active: true,
    nickname: 'Jen',
    firstName: 'Jennifer',
    lastName: raw('?', 'Lawrence'),
    middleName: null,
  };
  // Optional and nullable properties may be left out.
  const withoutMiddleName: Insertable<Owner> = { firstName: 'Jennifer' };

  // @ts-expect-error firstName is required
  const missingRequired: Insertable<Owner> = { lastName: 'Lawrence' };
  // @ts-expect-error id is a number
  const wrongType: Insertable<Owner> = { firstName: 'Jennifer', id: 'one' };
  // @ts-expect-error relations are left out, use InsertableGraph
  const withRelation: Insertable<Owner> = { firstName: 'Jennifer', pets: [] };

  // Insertable data is accepted by insert() and PartialModelObject.
  const partial: PartialModelObject<Owner> = full;
  await Owner.query().insert(minimal);
  await Owner.query().insert([minimal, full]);
  await Owner.query().insertAndFetch({ firstName: 'Jennifer' } satisfies Insertable<Owner>);

  // insert() itself still treats all properties as optional.
  await Owner.query().insert({ lastName: 'Lawrence' });
  await Owner.query().patch({ id: 1, createdAt: new Date() });
}

async function insertableGraph() {
  const graph: InsertableGraph<Owner> = {
    '#id': 'jennifer',
    firstName: 'Jennifer',
    pets: [
      { name: 'Doggo', ownerId: 1 },
      { name: 'Kat', ownerId: 1, owner: { '#ref': 'jennifer' } },
      { '#dbRef': 1 },
    ],
  };
  const petGraph: InsertableGraph<Pet> = { name: 'Doggo', ownerId: 1, owner: null };

  // @ts-expect-error name is required on the related pets
  const missingRelatedRequired: InsertableGraph<Owner> = { firstName: 'J', pets: [{ ownerId: 1 }] };
  // @ts-expect-error pets holds an array
  const wrongCardinality: InsertableGraph<Owner> = { firstName: 'J', pets: { name: 'Doggo' } };

  // Insertable graphs are accepted by insertGraph() and PartialModelGraph.
  const partial: PartialModelGraph<Owner> = graph;
  await Owner.query().insertGraph(graph, { allowRefs: true });
  await Owner.query().insertGraphAndFetch([graph]);
  await Pet.query().insertGraph(petGraph);
}

// Generated also works in an interface merged into the model class.
interface CompanyProps {
  id: Generated<number>;
  name: string;
}

interface Company extends CompanyProps {}

class Company extends Model {}

async function insertableFromInterface() {
  const company: Insertable<Company> = { name: 'Lineto' };
  const id: number = (await Company.query().insert(company)).id;
  // @ts-expect-error name is required
  const missingName: Insertable<Company> = { id: 1 };
}
