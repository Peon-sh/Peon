import { describe, it, expect } from 'vitest';
import {
  parsePostgresMajorVersion,
  resolveDatabaseDataPath,
  POSTGRES_DATA_PATH_LEGACY,
  POSTGRES_DATA_PATH_V18,
  DATABASE_ENGINES,
} from '../databases';

describe('parsePostgresMajorVersion', () => {
  it('parses official postgres tags', () => {
    expect(parsePostgresMajorVersion('postgres:18-alpine')).toBe(18);
    expect(parsePostgresMajorVersion('postgres:16-alpine')).toBe(16);
    expect(parsePostgresMajorVersion('postgres:17')).toBe(17);
  });

  it('parses postgis and supabase tags', () => {
    expect(parsePostgresMajorVersion('postgis/postgis:17-3.5-alpine')).toBe(17);
    expect(parsePostgresMajorVersion('supabase/postgres:17.4.1.032')).toBe(17);
  });

  it('parses pgvector-style tags', () => {
    expect(parsePostgresMajorVersion('pgvector/pgvector:pg18')).toBe(18);
    expect(parsePostgresMajorVersion('pgvector/pgvector:pg17')).toBe(17);
  });

  it('returns null when version cannot be inferred', () => {
    expect(parsePostgresMajorVersion('custom/postgres:latest')).toBeNull();
  });
});

describe('resolveDatabaseDataPath', () => {
  it('uses /var/lib/postgresql for Postgres 18+', () => {
    expect(resolveDatabaseDataPath('POSTGRESQL', 'postgres:18-alpine')).toBe(POSTGRES_DATA_PATH_V18);
    expect(resolveDatabaseDataPath('POSTGRESQL', 'pgvector/pgvector:pg18')).toBe(POSTGRES_DATA_PATH_V18);
  });

  it('uses legacy .../data path for Postgres 16/17', () => {
    expect(resolveDatabaseDataPath('POSTGRESQL', 'postgres:16-alpine')).toBe(POSTGRES_DATA_PATH_LEGACY);
    expect(resolveDatabaseDataPath('POSTGRESQL', 'postgres:17-alpine')).toBe(POSTGRES_DATA_PATH_LEGACY);
    expect(resolveDatabaseDataPath('POSTGRESQL', 'postgis/postgis:17-3.5-alpine')).toBe(
      POSTGRES_DATA_PATH_LEGACY,
    );
  });

  it('defaults to the v18 path when image is omitted (default image is 18)', () => {
    expect(resolveDatabaseDataPath('POSTGRESQL', null)).toBe(POSTGRES_DATA_PATH_V18);
    expect(resolveDatabaseDataPath('POSTGRESQL')).toBe(POSTGRES_DATA_PATH_V18);
  });

  it('leaves non-Postgres engines unchanged', () => {
    expect(resolveDatabaseDataPath('MYSQL', 'mysql:8')).toBe('/var/lib/mysql');
    expect(resolveDatabaseDataPath('REDIS', 'redis:7-alpine')).toBe('/data');
  });
});

describe('dumpCommand dumpAll', () => {
  const creds = {
    username: 'peon',
    password: 'secret',
    database: 'appdb',
    rootPassword: 'rootsecret',
  };

  it('defaults Postgres to single-DB dump when dumpAll is unset', () => {
    expect(DATABASE_ENGINES.POSTGRESQL.dumpCommand?.(creds)).toBe(`pg_dump -U 'peon' 'appdb'`);
  });

  it('uses pg_dumpall for Postgres when dumpAll is true', () => {
    expect(DATABASE_ENGINES.POSTGRESQL.dumpCommand?.(creds, { dumpAll: true })).toBe(
      `pg_dumpall -U 'peon'`,
    );
    expect(DATABASE_ENGINES.POSTGRESQL.restoreCommand?.(creds, { dumpAll: true })).toBe(
      `psql -U 'peon' -d postgres`,
    );
  });

  it('uses --all-databases for MySQL/MariaDB when dumpAll is true', () => {
    expect(DATABASE_ENGINES.MYSQL.dumpCommand?.(creds, { dumpAll: true })).toBe(
      `mysqldump -u root -p'rootsecret' --all-databases`,
    );
    expect(DATABASE_ENGINES.MARIADB.dumpCommand?.(creds, { dumpAll: true })).toBe(
      `mariadb-dump -u root -p'rootsecret' --all-databases`,
    );
  });
});

describe('credential quoting', () => {
  // A credential that terminates the `sh -c '...'` argument and appends a
  // second host-level command. Unquoted, this yields RCE on the managed
  // server as the SSH user. See runBackup / runRestore in backup/engine.ts.
  const INJECTION = String.raw`x'; id > /tmp/pwned; echo '`;

  it('neutralises a quote-escape payload in the MySQL root password', () => {
    const cmd = DATABASE_ENGINES.MYSQL.dumpCommand?.(
      { rootPassword: INJECTION },
      { dumpAll: true },
    );
    expect(cmd).not.toContain(`-px'; id`);
    expect(cmd).toBe(`mysqldump -u root -p'x'\\''; id > /tmp/pwned; echo '\\''' --all-databases`);
  });

  it('neutralises a quote-escape payload in the Postgres username', () => {
    const cmd = DATABASE_ENGINES.POSTGRESQL.dumpCommand?.(
      { username: INJECTION },
      { dumpAll: true },
    );
    expect(cmd).not.toContain(`-U x'; id`);
    expect(cmd).toBe(`pg_dumpall -U 'x'\\''; id > /tmp/pwned; echo '\\'''`);
  });

  it('neutralises a payload in the database name on the restore path', () => {
    const cmd = DATABASE_ENGINES.POSTGRESQL.restoreCommand?.({
      username: 'peon',
      database: INJECTION,
    });
    expect(cmd).not.toContain(`psql -U 'peon' x'; id`);
    expect(cmd).toContain(`'x'\\''; id > /tmp/pwned; echo '\\'''`);
  });

  it('quotes credentials containing spaces so the container shell cannot split them', () => {
    // Outer `sh -c` quoting alone would not fix this — the inner shell splits.
    expect(DATABASE_ENGINES.MYSQL.dumpCommand?.({ rootPassword: 'my pass' }, { dumpAll: true }))
      .toBe(`mysqldump -u root -p'my pass' --all-databases`);
  });

  it('omits -p entirely when no password is set', () => {
    // `-p''` would collapse to a bare `-p`, making the client prompt for a
    // password and hang on the non-interactive SSH channel.
    const cmd = DATABASE_ENGINES.MYSQL.dumpCommand?.({}, { dumpAll: true });
    expect(cmd).toBe('mysqldump -u root --all-databases');
    expect(cmd).not.toMatch(/-p(\s|$)/);
  });

  it('falls back to the app password when no root password is set', () => {
    expect(DATABASE_ENGINES.MARIADB.dumpCommand?.({ password: 'apppw' }, { dumpAll: true })).toBe(
      `mariadb-dump -u root -p'apppw' --all-databases`,
    );
  });
});
