import { prisma } from '@/lib/prisma';

/** Wipe all application tables between tests (keeps schema). */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
