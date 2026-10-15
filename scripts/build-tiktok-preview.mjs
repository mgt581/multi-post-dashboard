import { mkdir, readdir, copyFile, rm, writeFile, readFile } from 'node:fs/promises';
const destination = new URL('../work/tiktok-preview-assets/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const filename of await readdir(new URL('../', import.meta.url))) {
  if (/\.(html|png|webmanifest)$/.test(filename) || ['billing-ui.mjs','image-preprocessor.mjs','app.js','sw.js'].includes(filename)) {
    await copyFile(new URL('../'+filename, import.meta.url), new URL(filename, destination));
  }
}

// Pinned baseline service worker for a browser-visible POST-loss reproduction.
// Keep its direct request on the isolated preview, never the production Worker.
const baseline = (await readFile(new URL('../tests/fixtures/oauth-baseline-sw.js', import.meta.url), 'utf8'))
  .replace('"https://multipost-seo-worker.alexbryant.workers.dev"', 'self.location.origin')
  .replace('target.pathname = url.pathname;', 'target.pathname = "/regression-echo" + url.pathname;');
await writeFile(new URL('baseline-sw.js', destination), baseline);
