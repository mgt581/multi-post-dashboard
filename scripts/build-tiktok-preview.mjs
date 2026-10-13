import { mkdir, readdir, copyFile, rm } from 'node:fs/promises';
const destination = new URL('../work/tiktok-preview-assets/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const filename of await readdir(new URL('../', import.meta.url))) {
  if (/\.(html|png|webmanifest)$/.test(filename) || ['billing-ui.mjs','image-preprocessor.mjs','app.js'].includes(filename)) {
    await copyFile(new URL('../'+filename, import.meta.url), new URL(filename, destination));
  }
}
