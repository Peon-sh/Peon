import type { DatabaseEngine } from '@/lib/prisma';
import { shellSingleQuote } from '@/lib/shell/quote';

export type DbCredentialColumn = 'dbUsername' | 'dbPassword' | 'dbName' | 'dbRootPassword';

export interface DbCredentialField {
  column: DbCredentialColumn;
  label: string;
  isPassword?: boolean;
}

export interface DumpOptions {
  /** When true, dump/restore every database in the instance (default for schedules). */
  dumpAll?: boolean;
}

export interface DatabaseEngineSpec {
  engine: DatabaseEngine;
  label: string;
  defaultImage: string;
  internalPort: number;
  /** Build container env from credentials. */
  env: (creds: DbCredentials) => Record<string, string>;
  /** Volume path inside the container that holds data. */
  dataPath: string;
  /**
   * Which credential columns this engine uses - drives the engine-specific
   * "General" form on the service page. New engines get a form for free.
   */
  credentialFields: DbCredentialField[];
  /** Builds a connection URL, or null when the engine has no URL scheme. */
  connectionUrl?: (creds: DbCredentials, host: string, port: number) => string;
  /** Shell command (inside container) to produce a logical dump to stdout. */
  dumpCommand?: (creds: DbCredentials, opts?: DumpOptions) => string;
  /** Command to restore from a dump piped over stdin. */
  restoreCommand?: (creds: DbCredentials, opts?: DumpOptions) => string;
}

export interface DbCredentials {
  username?: string | null;
  password?: string | null;
  database?: string | null;
  rootPassword?: string | null;
}

/**
 * Credentials are operator-supplied and reach these builders unvalidated, so
 * every interpolation must be quoted. The result is additionally quoted as a
 * whole by `dockerExecShellCommand` before it reaches the remote shell; both
 * layers are required, since outer quoting alone still leaves the container
 * shell to word-split on spaces inside a value.
 */
const q = shellSingleQuote;

/**
 * MySQL/MariaDB auth flags. The password must stay attached to `-p` with no
 * space, and `-p` must be omitted entirely when there is none — an empty
 * quoted value collapses to a bare `-p`, which makes the client prompt for a
 * password and hang on a non-interactive SSH channel.
 */
function mysqlAuth(c: DbCredentials): string {
  const password = c.rootPassword ?? c.password;
  return password ? `-u root -p${q(password)}` : '-u root';
}

/**
 * Official postgres:18+ images store data under versioned dirs and expect the
 * volume mounted at /var/lib/postgresql (not .../data). See docker-library/postgres#1259.
 */
export const POSTGRES_DATA_PATH_LEGACY = '/var/lib/postgresql/data';
export const POSTGRES_DATA_PATH_V18 = '/var/lib/postgresql';

/** Extract major version from common Postgres image tags. */
export function parsePostgresMajorVersion(image: string): number | null {
  // pgvector/pgvector:pg18, bitnami/postgresql:pg16, etc.
  const pgTag = image.match(/(?:^|[/:])pg(\d+)\b/i);
  if (pgTag) return Number(pgTag[1]);
  const tag = image.includes(':') ? image.slice(image.lastIndexOf(':') + 1) : image;
  const m = tag.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Resolve the container data mount path for a database image.
 * Postgres 18+ official images require a different path than 16/17.
 */
export function resolveDatabaseDataPath(engine: DatabaseEngine, image?: string | null): string {
  const spec = DATABASE_ENGINES[engine];
  if (engine !== 'POSTGRESQL') return spec.dataPath;
  const major =
    parsePostgresMajorVersion(image ?? '') ??
    parsePostgresMajorVersion(spec.defaultImage) ??
    16;
  return major >= 18 ? POSTGRES_DATA_PATH_V18 : POSTGRES_DATA_PATH_LEGACY;
}

export const DATABASE_ENGINES: Record<DatabaseEngine, DatabaseEngineSpec> = {
  POSTGRESQL: {
    engine: 'POSTGRESQL',
    label: 'PostgreSQL',
    defaultImage: 'postgres:18-alpine',
    internalPort: 5432,
    dataPath: POSTGRES_DATA_PATH_LEGACY,
    env: (c) => ({
      POSTGRES_USER: c.username ?? 'postgres',
      POSTGRES_PASSWORD: c.password ?? '',
      POSTGRES_DB: c.database ?? 'postgres',
    }),
    credentialFields: [
      { column: 'dbUsername', label: 'Username' },
      { column: 'dbPassword', label: 'Password', isPassword: true },
      { column: 'dbName', label: 'Initial Database' },
    ],
    connectionUrl: (c, host, port) =>
      `postgres://${c.username ?? 'postgres'}:${c.password ?? ''}@${host}:${port}/${c.database ?? 'postgres'}`,
    dumpCommand: (c, opts) =>
      opts?.dumpAll
        ? `pg_dumpall -U ${q(c.username ?? 'postgres')}`
        : `pg_dump -U ${q(c.username ?? 'postgres')} ${q(c.database ?? 'postgres')}`,
    restoreCommand: (c, opts) =>
      opts?.dumpAll
        ? `psql -U ${q(c.username ?? 'postgres')} -d postgres`
        : `psql -U ${q(c.username ?? 'postgres')} ${q(c.database ?? 'postgres')}`,
  },
  MYSQL: {
    engine: 'MYSQL',
    label: 'MySQL',
    defaultImage: 'mysql:8',
    internalPort: 3306,
    dataPath: '/var/lib/mysql',
    env: (c) => ({
      MYSQL_ROOT_PASSWORD: c.rootPassword ?? c.password ?? '',
      MYSQL_USER: c.username ?? 'mysql',
      MYSQL_PASSWORD: c.password ?? '',
      MYSQL_DATABASE: c.database ?? 'app',
    }),
    credentialFields: [
      { column: 'dbUsername', label: 'Username' },
      { column: 'dbPassword', label: 'Password', isPassword: true },
      { column: 'dbRootPassword', label: 'Root Password', isPassword: true },
      { column: 'dbName', label: 'Database Name' },
    ],
    connectionUrl: (c, host, port) =>
      `mysql://${c.username ?? 'mysql'}:${c.password ?? ''}@${host}:${port}/${c.database ?? 'app'}`,
    dumpCommand: (c, opts) => {
      const auth = mysqlAuth(c);
      return opts?.dumpAll
        ? `mysqldump ${auth} --all-databases`
        : `mysqldump ${auth} ${q(c.database ?? 'app')}`;
    },
    restoreCommand: (c, opts) => {
      const auth = mysqlAuth(c);
      return opts?.dumpAll ? `mysql ${auth}` : `mysql ${auth} ${q(c.database ?? 'app')}`;
    },
  },
  MARIADB: {
    engine: 'MARIADB',
    label: 'MariaDB',
    defaultImage: 'mariadb:11',
    internalPort: 3306,
    dataPath: '/var/lib/mysql',
    env: (c) => ({
      MARIADB_ROOT_PASSWORD: c.rootPassword ?? c.password ?? '',
      MARIADB_USER: c.username ?? 'mariadb',
      MARIADB_PASSWORD: c.password ?? '',
      MARIADB_DATABASE: c.database ?? 'app',
    }),
    credentialFields: [
      { column: 'dbUsername', label: 'Username' },
      { column: 'dbPassword', label: 'Password', isPassword: true },
      { column: 'dbRootPassword', label: 'Root Password', isPassword: true },
      { column: 'dbName', label: 'Database Name' },
    ],
    connectionUrl: (c, host, port) =>
      `mysql://${c.username ?? 'mariadb'}:${c.password ?? ''}@${host}:${port}/${c.database ?? 'app'}`,
    dumpCommand: (c, opts) => {
      const auth = mysqlAuth(c);
      return opts?.dumpAll
        ? `mariadb-dump ${auth} --all-databases`
        : `mariadb-dump ${auth} ${q(c.database ?? 'app')}`;
    },
    restoreCommand: (c, opts) => {
      const auth = mysqlAuth(c);
      return opts?.dumpAll ? `mariadb ${auth}` : `mariadb ${auth} ${q(c.database ?? 'app')}`;
    },
  },
  MONGODB: {
    engine: 'MONGODB',
    label: 'MongoDB',
    defaultImage: 'mongo:7',
    internalPort: 27017,
    dataPath: '/data/db',
    env: (c) => ({
      MONGO_INITDB_ROOT_USERNAME: c.username ?? 'root',
      MONGO_INITDB_ROOT_PASSWORD: c.password ?? '',
      MONGO_INITDB_DATABASE: c.database ?? 'app',
    }),
    credentialFields: [
      { column: 'dbUsername', label: 'Root Username' },
      { column: 'dbPassword', label: 'Root Password', isPassword: true },
      { column: 'dbName', label: 'Initial Database' },
    ],
    connectionUrl: (c, host, port) =>
      `mongodb://${c.username ?? 'root'}:${c.password ?? ''}@${host}:${port}/${c.database ?? 'app'}?authSource=admin`,
    // mongodump/mongorestore without --db always cover the whole instance.
    dumpCommand: () => `mongodump --archive`,
    restoreCommand: () => `mongorestore --archive`,
  },
  REDIS: {
    engine: 'REDIS',
    label: 'Redis',
    defaultImage: 'redis:7-alpine',
    internalPort: 6379,
    dataPath: '/data',
    env: () => ({}),
    credentialFields: [],
    connectionUrl: (_c, host, port) => `redis://${host}:${port}`,
    dumpCommand: () => `redis-cli --rdb /tmp/dump.rdb && cat /tmp/dump.rdb`,
  },
  KEYDB: {
    engine: 'KEYDB',
    label: 'KeyDB',
    defaultImage: 'eqalpha/keydb:latest',
    internalPort: 6379,
    dataPath: '/data',
    env: () => ({}),
    credentialFields: [],
    connectionUrl: (_c, host, port) => `redis://${host}:${port}`,
  },
  DRAGONFLY: {
    engine: 'DRAGONFLY',
    label: 'Dragonfly',
    defaultImage: 'docker.dragonflydb.io/dragonflydb/dragonfly:latest',
    internalPort: 6379,
    dataPath: '/data',
    env: () => ({}),
    credentialFields: [],
    connectionUrl: (_c, host, port) => `redis://${host}:${port}`,
  },
  CLICKHOUSE: {
    engine: 'CLICKHOUSE',
    label: 'ClickHouse',
    defaultImage: 'clickhouse/clickhouse-server:latest',
    internalPort: 9000,
    dataPath: '/var/lib/clickhouse',
    env: (c) => ({
      CLICKHOUSE_USER: c.username ?? 'default',
      CLICKHOUSE_PASSWORD: c.password ?? '',
      CLICKHOUSE_DB: c.database ?? 'default',
    }),
    credentialFields: [
      { column: 'dbUsername', label: 'Username' },
      { column: 'dbPassword', label: 'Password', isPassword: true },
      { column: 'dbName', label: 'Database Name' },
    ],
    connectionUrl: (c, host, port) =>
      `clickhouse://${c.username ?? 'default'}:${c.password ?? ''}@${host}:${port}/${c.database ?? 'default'}`,
  },
};

export function engineSpec(engine: DatabaseEngine): DatabaseEngineSpec {
  return DATABASE_ENGINES[engine];
}
