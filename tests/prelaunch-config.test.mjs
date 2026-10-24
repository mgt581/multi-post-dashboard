import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIsolated, previewName, databaseName } from '../scripts/configure-prelaunch-preview.mjs';
const safe = () => ({ name:previewName, main:'prelaunch-preview-worker.mjs', routes:[], vars:{PRELAUNCH_ISOLATED:'true'}, d1_databases:[{binding:'DB', database_name:databaseName, database_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}] });
test('direct preview deployment accepts only dedicated staging bindings', () => {
  assert.doesNotThrow(() => assertIsolated(safe()));
  for (const mutate of [c=>c.name='multipost-seo-worker', c=>c.main='worker.js', c=>c.routes.push('multipostapp.co.uk/*'), c=>c.d1_databases[0].database_id='19dfae46-a6cb-4e88-ab7c-2ab2fea3279a', c=>c.d1_databases[0].database_name='accountsmultipostapp', c=>c.env={production:{}}, c=>c.services=[{binding:'PRODUCTION'}]]) {
    const config=safe(); mutate(config); assert.throws(()=>assertIsolated(config), /isolation/);
  }
});
