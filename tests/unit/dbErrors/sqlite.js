import { describe, it, expect } from 'vitest';
import {
  wrapError,
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  CheckViolationError,
  ForeignKeyViolationError,
} from '../../../lib/dbErrors/index.js';

// The errors of the two SQLite drivers of knex, as they throw them, after the
// SQL that knex puts in front: `sqlite3` with an `errno` and the code in the
// message, `better-sqlite3` named `SqliteError`, with the extended codes and
// without the code in the message.
function createSqlite3Error(code, errno, message, sql) {
  return Object.assign(new Error(`${sql} - ${code}: ${message}`), { code, errno });
}

function createBetterSqlite3Error(code, message, sql) {
  const err = Object.assign(new Error(`${sql} - ${message}`), { code });
  err.name = 'SqliteError';
  return err;
}

describe('SQLite database errors', () => {
  for (const [driver, createError] of [
    [
      'sqlite3',
      (code, extendedCode, message) =>
        createSqlite3Error(code, code === 'SQLITE_ERROR' ? 1 : 19, message),
    ],
    [
      'better-sqlite3',
      (code, extendedCode, message, sql = 'insert into t') =>
        createBetterSqlite3Error(extendedCode, message, sql),
    ],
  ]) {
    describe(driver, () => {
      it('should wrap unique violations', () => {
        const err = wrapError(
          createError(
            'SQLITE_CONSTRAINT',
            'SQLITE_CONSTRAINT_UNIQUE',
            'UNIQUE constraint failed: t.a, t.b',
          ),
        );
        expect(err).toBeInstanceOf(UniqueViolationError);
        expect(err).toMatchObject({ table: 't', columns: ['a', 'b'], client: 'sqlite' });
      });

      it('should wrap not null violations', () => {
        const err = wrapError(
          createError(
            'SQLITE_CONSTRAINT',
            'SQLITE_CONSTRAINT_NOTNULL',
            'NOT NULL constraint failed: t.b',
          ),
        );
        expect(err).toBeInstanceOf(NotNullViolationError);
        expect(err).toMatchObject({ table: 't', column: 'b' });
      });

      it('should wrap check violations', () => {
        const err = wrapError(
          createError(
            'SQLITE_CONSTRAINT',
            'SQLITE_CONSTRAINT_CHECK',
            'CHECK constraint failed: c > 0',
          ),
        );
        expect(err).toBeInstanceOf(CheckViolationError);
      });

      it('should wrap foreign key violations', () => {
        const err = wrapError(
          createError(
            'SQLITE_CONSTRAINT',
            'SQLITE_CONSTRAINT_FOREIGNKEY',
            'FOREIGN KEY constraint failed',
          ),
        );
        expect(err).toBeInstanceOf(ForeignKeyViolationError);
      });

      it('should read the kind from the error, not from the values in the SQL', () => {
        const err = wrapError(
          createError(
            'SQLITE_CONSTRAINT',
            'SQLITE_CONSTRAINT_CHECK',
            'CHECK constraint failed: c > 0',
            "insert into t (a) values ('SQLITE_CONSTRAINT: UNIQUE constraint failed: x.y')",
          ),
        );
        expect(err).toBeInstanceOf(CheckViolationError);
      });

      it('should read the columns from the error, not from the values in the SQL', () => {
        const err = wrapError(
          createError(
            'SQLITE_CONSTRAINT',
            'SQLITE_CONSTRAINT_UNIQUE',
            'UNIQUE constraint failed: t.a',
            "insert into t (a) values ('UNIQUE constraint failed: x.y')",
          ),
        );
        expect(err).toMatchObject({ table: 't', columns: ['a'] });
      });

      it('should wrap other errors', () => {
        const err = wrapError(createError('SQLITE_ERROR', 'SQLITE_ERROR', 'no such table: nope'));
        expect(err).toBeInstanceOf(DBError);
        expect(err).not.toBeInstanceOf(UniqueViolationError);
      });
    });
  }
});
