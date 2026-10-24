// Run from the repository root after signing into the existing Cloudflare account.
// This does not use GitHub Actions or the production wrangler.toml.
import { spawnSync } from 'node:child_process';
import { configure, assertIsolated, runWrangler, configPath, databaseName } from './configure-prelaunch-preview.mjs';
function node(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Local validation failed; deployment stopped.');
}
node(['--test']);
node(['scripts/build-prelaunch-preview.mjs']);
const config = await configure();
assertIsolated(config);
runWrangler(['deploy', '--dry-run', '--config', configPath]);
// schema.sql contains CREATE TABLE IF NOT EXISTS statements only. This named DB
// is newly created for synthetic staging and is never a production database.
runWrangler(['d1', 'execute', databaseName, '--remote', '--file=schema.sql', '--config', configPath]);
runWrangler(['deploy', '--config', configPath]);
console.log('Staging deploy completed. Verify its reported URL before handing it over.');
