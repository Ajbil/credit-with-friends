import { PrismaClient } from '@prisma/client';

export default async function teardown(): Promise<void> {
  const schema = process.env.CWF_WEB_TEST_SCHEMA;
  if (!schema || !/^cwf_web_test_[a-f0-9]{32}$/.test(schema)) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends');
  databaseUrl.searchParams.delete('schema');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
}
