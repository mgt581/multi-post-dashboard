import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const previewName = 'multipost-prelaunch-preview-20261024';
export const databaseName = 'multipost-prelaunch-isolated-20261024';
export const configPath = 'wrangler.prelaunch.json';
export function assertIsolated(config) {
  if (config.name !== previewName || config.main !== 'prelaunch-preview-worker.mjs' ||
      config.routes?.length !== 0 || config.vars?.PRELAUNCH_ISOLATED !== 'true' ||
      config.d1_databases?.length !== 1 || config.d1_databases[0].binding !== 'DB' ||
      config.d1_databases[0].database_name !== databaseName ||
      !/^[a-f0-9-]{36}$/i.test(config.d1_databases[0].database_id || '') ||
      config.d1_databases[0].database_id === '19dfae46-a6cb-4e88-ab7c-2ab2fea3279a' ||
      config.ai || config.env || config.services || config.kv_namespaces || config.r2_buckets) {
    throw new Error('Refusing deployment: staging isolation checks failed.');
  }
}
export function runWrangler(args, capture = false) {
  // Use the existing Wrangler session; no token copying or GitHub Actions.
  const binary = process.env.MULTIPOST_WRANGLER || path.resolve('node_modules/.bin/wrangler');
  const result = spawnSync(binary, args, {
    env: { ...process.env, WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || '/tmp/multipost-direct-preview.log' },
    encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit'
  });
  if (result.error) throw new Error(`Could not start Wrangler: ${result.error.message}`);
  if (result.status !== 0) throw new Error('Cloudflare command failed. Check the displayed login or deployment error.');
  return result.stdout;
}
export async function configure() {
  const config = {
    name: previewName, main: 'prelaunch-preview-worker.mjs', compatibility_date: '2026-10-01',
    workers_dev: true, preview_urls: true, routes: [],
    assets: { directory: './work/prelaunch-assets', binding: 'ASSETS', run_worker_first: true },
    vars: { PRELAUNCH_ISOLATED: 'true' }
  };
  // Read account state before any creation; this fails cleanly if login has expired.
  const listed = runWrangler(['d1', 'list', '--json'], true);
  const databases = JSON.parse(listed);
  const existing = databases.find(db => db.name === databaseName);
  if (existing) config.d1_databases = [{ binding: 'DB', database_name: databaseName, database_id: existing.uuid }];
  await writeFile(configPath, JSON.stringify(config, null, 2));
  if (!existing) runWrangler(['d1', 'create', databaseName, '--binding', 'DB', '--update-config', '--config', configPath]);
  const final = JSON.parse(await readFile(configPath, 'utf8'));
  assertIsolated(final);
  console.log('Verified dedicated staging database and Worker configuration. Production is not bound.');
  return final;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await configure();
