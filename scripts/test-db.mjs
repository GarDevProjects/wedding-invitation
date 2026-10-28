import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pgtap } from '@electric-sql/pglite-pgtap';
import { readFile } from 'node:fs/promises';

const db = new PGlite({ extensions: { pgcrypto, pgtap } });
try {
  // Minimal Supabase role/Auth fixtures. The actual migration and pgTAP tests are unchanged.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema extensions;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  await db.exec(await readFile('supabase/migrations/202610280001_wedding.sql', 'utf8'));
  const results = await db.exec(await readFile('supabase/tests/database/security.test.sql', 'utf8'));
  const lines = results.flatMap(result => result.rows.flatMap(row => Object.values(row))).filter(value => typeof value === 'string' && /^(ok |not ok |1\.\.|#)/.test(value));
  for (const line of lines) console.log(line);
  if (!lines.some(line => /^1\.\.32/.test(line)) || lines.some(line => /^not ok|^# Looks like/.test(line))) process.exitCode = 1;
} catch (error) {
  console.error(`Database check failed: ${error.message}`);
  process.exitCode = 1;
} finally { await db.close(); }
