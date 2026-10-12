// Type tests for relation expressions in strict mode: unknown relations are
// rejected.

import { Model } from 'objection';
import { Person } from './models.js';

async function relationExpressions() {
  await Person.query().joinRelated('pets.owner').withGraphFetched('[children.pets, parent]');
  await Person.query().withGraphJoined({ pets: { owner: true } });
  await Person.query().joinRelated('pets(onlyDogs) as p.owner');
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
  // @ts-expect-error
  await Person.query().withGraph('lastName');

  // Expressions that can't be resolved aren't checked.
  const expr: string = 'petz';
  await Person.query().joinRelated(expr).withGraphFetched(expr);
  await Person.query().joinRelated('children.^').withGraphFetched('children.*');
  // Nor are models without declared columns.
  await Model.query().joinRelated('anything').withGraphFetched('anything');

  // The narrowing of withGraphFetched() works as in loose mode.
  const people = await Person.query().withGraphFetched('pets.owner').where('pets.name', 'x');
  people[0].pets[0].owner.firstName;
}
