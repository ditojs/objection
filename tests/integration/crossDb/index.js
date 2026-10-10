import { describe } from 'vitest';
import mysql from './mysql.js';

export default (session) => {
  // vitest fails on empty suites, so only add the suite for the databases that have tests.
  if (session.isMySql()) {
    describe('cross db', () => {
      mysql(session);
    });
  }
};
