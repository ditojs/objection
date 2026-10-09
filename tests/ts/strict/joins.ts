// Type tests for the scope of joined relations in strict mode, and for how
// the scope is kept along the query.

import './strict-mode';
import { Model, Page, QueryBuilder } from 'objection';
import { Animal, CustomPerson, Person } from './models';
import { Equal, Expect } from './strict-mode';

async function joinRelated() {
  // Joined relations are in scope under their objection aliases.
  await Person.query().joinRelated('pets').where('pets.name', 'Fluffy');
  await Person.query().leftJoinRelated('parent').where('parent.firstName', 'Jennifer');
  await Person.query().innerJoinRelated('pets').orderBy('pets.name').select('pets.*');
  // @ts-expect-error not joined
  await Person.query().where('pets.name', 'Fluffy');
  // @ts-expect-error typo
  await Person.query().joinRelated('pets').where('pets.nme', 'Fluffy');
  // @ts-expect-error not a column of the joined relation
  await Person.query().joinRelated('pets').where('pets.age', 1);
  // @ts-expect-error joined columns need to be qualified
  await Person.query().joinRelated('pets').where('species', 'cat');

  // Nested relations use ':' in their aliases.
  await Person.query()
    .joinRelated('pets.owner')
    .where('pets.name', 'Fluffy')
    .where('pets:owner.firstName', 'Jennifer');
  await Person.query()
    .joinRelated('[pets.owner.children, program]')
    .where('pets:owner:children.age', '>', 1)
    .where('program.name', 'x');
  // @ts-expect-error
  await Person.query().joinRelated('pets.owner').where('owner.firstName', 'Jennifer');

  // Aliases and modifiers.
  await Person.query().joinRelated('pets as p').where('p.name', 'Fluffy');
  await Person.query().joinRelated('pets(onlyDogs) as p.owner').where('p:owner.age', 1);
  // @ts-expect-error aliased away
  await Person.query().joinRelated('pets as p').where('pets.name', 'Fluffy');

  // Object notation, also with aliases.
  await Person.query()
    .joinRelated({ pets: { owner: true } })
    .where('pets:owner.age', 1);
  await Person.query()
    .joinRelated({ p: { $relation: 'pets' } })
    .where('p.name', 'Fluffy');

  // Chained joins accumulate.
  await Person.query()
    .joinRelated('pets')
    .joinRelated('children')
    .where('pets.name', 'Fluffy')
    .where('children.age', 1);

  // Options that change the aliases open the scope.
  await Person.query().joinRelated('pets', { alias: 'p' }).where('p.anything', 1);
  await Person.query()
    .joinRelated('pets', { aliases: { pets: 'p' } })
    .where('p.x', 1);

  // Expressions that can't be resolved open the scope.
  const expr: string = 'pets';
  await Person.query().joinRelated(expr).where('anything', 1);
  await Person.query().joinRelated('children.^').where('anything', 1);
  await Person.query().joinRelated('children.*').where('anything', 1);

  // Unknown relations are rejected.
  // @ts-expect-error
  await Person.query().joinRelated('petz');
  // @ts-expect-error
  await Person.query().joinRelated('[pets.ownr, children]');
  // @ts-expect-error
  await Person.query().joinRelated({ petz: true });
  // @ts-expect-error
  await Person.query().withGraphFetched('pets.ownr');
  // @ts-expect-error
  await Person.query().withGraphJoined('chldren');
  // But not in models without declared columns.
  await Model.query().joinRelated('anything').withGraphFetched('anything');
}

async function withGraphJoined() {
  // withGraphJoined() joins the relations too, and narrows the result.
  const people = await Person.query()
    .withGraphJoined('[pets, children.pets]')
    .where('pets.species', 'dog')
    .where('children:pets.name', 'Fluffy')
    .orderBy('persons.id');
  people[0].children[0].pets.length;
  // @ts-expect-error
  await Person.query().withGraphJoined('pets').where('pets.species', 'cow');
  // @ts-expect-error
  await Person.query().withGraphJoined('pets').where('children.age', 1);

  // Options that change the aliases open the scope.
  await Person.query().withGraphJoined('pets', { minimize: true }).where('_t1.x', 1);
  await Person.query().withGraphJoined('pets', { joinOperation: 'innerJoin' }).where('pets.id', 1);

  // withGraphFetched() fetches relations in separate queries.
  // @ts-expect-error
  await Person.query().withGraphFetched('pets').where('pets.name', 'Fluffy');
  // But keeps the existing scope.
  await Person.query().joinRelated('pets').withGraphFetched('children').where('pets.name', 'x');
}

async function keptScope() {
  // The scope is kept when the result kind changes.
  await Person.query().joinRelated('pets').findById(1).where('pets.name', 'Fluffy');
  await Person.query().joinRelated('pets').first().where('pets.name', 'Fluffy');
  await Person.query().joinRelated('pets').page(0, 10).orderBy('pets.name');
  await Person.query().joinRelated('pets').where('pets.name', 'x').throwIfNotFound();
  await Person.query().joinRelated('pets').patch({ age: 1 }).where('pets.name', 'Fluffy');
  // @ts-expect-error
  await Person.query().joinRelated('pets').findById(1).where('pets.nme', 'Fluffy');

  // The result types aren't affected by the scope.
  const a = await Person.query().joinRelated('pets').where('pets.name', 'x');
  type _a = Expect<Equal<typeof a, Person[]>>;
  const b = await Person.query().joinRelated('pets').findById(1);
  type _b = Expect<Equal<typeof b, Person | undefined>>;
  const c = await Person.query().joinRelated('pets').page(0, 10);
  type _c = Expect<Equal<typeof c, Page<Person>>>;

  // Scoped query builders are assignable to plain ones, and annotations
  // keep working, but drop the scope.
  const qb: QueryBuilder<Person> = Person.query().joinRelated('pets');
  // @ts-expect-error
  qb.where('pets.name', 'Fluffy');

  // Custom query builders keep their methods and the scope.
  await CustomPerson.query().joinRelated('pets').someCustomMethod().where('pets.name', 'x');
  await CustomPerson.query().joinRelated('pets').first().someCustomMethod().where('pets.name', 'x');
  // @ts-expect-error
  await CustomPerson.query().joinRelated('pets').someCustomMethod().where('pets.nme', 'x');
}

async function relatedQueries(person: Person) {
  // Related queries are scoped to the related model.
  await person.$relatedQuery('pets').where('species', 'dog');
  await Person.relatedQuery('pets').for(1).where('name', 'Fluffy');
  await person.$relatedQuery('pets').joinRelated('owner').where('owner.firstName', 'x');
  // @ts-expect-error
  await person.$relatedQuery('pets').where('firstName', 'Jennifer');
  await Animal.query().whereExists(Animal.relatedQuery('owner').where('firstName', 'x'));
}
