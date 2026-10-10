import { Person } from '../../fixtures/person.js';

(async () => {
  const person = await Person.query().findById(123);

  const numUnrelatedRows = await person!.$relatedQuery('movies').unrelate().where('id', 50);
})();
