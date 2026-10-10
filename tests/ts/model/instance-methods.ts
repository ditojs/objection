import { Person } from '../fixtures/person.js';
import { ModelObject } from 'objection';

const takesPersonPojo = (person: ModelObject<Person>) => true;

const person = Person.fromJson({ firstName: 'Jennifer' });
const personPojo = person.toJSON();

takesPersonPojo(personPojo);
