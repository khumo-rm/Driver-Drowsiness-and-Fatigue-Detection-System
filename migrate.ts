import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../src/db.js';

await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
for (const filename of (await readdir('db')).filter(f => f.endsWith('.sql')).sort()) {
  const done = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
  if (done.rowCount) continue;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(join('db', filename), 'utf8'));
    await client.query('INSERT INTO schema_migrations(filename) VALUES($1) ON CONFLICT DO NOTHING', [filename]);
    await client.query('COMMIT');
    console.log(`Applied ${filename}`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
await pool.end();
