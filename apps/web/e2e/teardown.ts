import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    if (process.env.CWF_WEB_TEST_COMPOSE === 'true') {
      execFileSync('docker', ['compose', '-p', 'cwf-web-tests', '-f', 'docker-compose.yml', 'down', '--volumes'], { cwd: fileURLToPath(new URL('../../../', import.meta.url)) });
    }
  }
}
