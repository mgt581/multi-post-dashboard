import { writeFile } from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw new Error('Missing existing Cloudflare deploy credentials');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
async function api(path='',init={}) {
 const response=await fetch(endpoint+path,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
 const result=await response.json();
 if(!result.success) throw new Error('Preview database operation failed: '+JSON.stringify(result.errors?.map(e=>({code:e.code,message:e.message}))));
 return result.result;
}
const name='multipost-prelaunch-isolated-20261024';
const databases=await api('?per_page=100');
let db=databases.find(db=>db.name===name);
if(!db) db=await api('',{method:'POST',body:JSON.stringify({name})});
if(!db.uuid) throw new Error('No isolated database UUID returned');
const config={name:'multipost-prelaunch-preview-20261024',main:'prelaunch-preview-worker.mjs',compatibility_date:'2026-10-01',workers_dev:true,preview_urls:true,routes:[],assets:{directory:'./work/prelaunch-assets',binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',database_name:name,database_id:db.uuid}],vars:{PRELAUNCH_ISOLATED:'true'}};
await writeFile('wrangler.prelaunch.json',JSON.stringify(config,null,2));
console.log('Dedicated preview configuration created; no production bindings or routes.');
