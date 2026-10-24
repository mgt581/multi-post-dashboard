import { mkdir, readdir, copyFile } from 'node:fs/promises';
const destination=new URL('../work/prelaunch-assets/',import.meta.url);
await mkdir(destination,{recursive:true});
for(const file of await readdir(new URL('../',import.meta.url))) {
 if(/\.(html|png|jpg|webmanifest|mp4|css|mjs|xml|txt)$/.test(file) && !/worker|preview/.test(file)) await copyFile(new URL('../'+file,import.meta.url),new URL(file,destination));
}
