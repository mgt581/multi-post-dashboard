import test from 'node:test';
import assert from 'node:assert/strict';
import {safeCategory,usageValues,schedule,storeSeo} from '../analytics/tracking.mjs';
import {authorized} from '../admin/security.mjs';
import {csv} from '../admin/report.mjs';
import worker from '../worker.js';
const content={youtube:{title:'Test'}};
test('safe errors never expose raw bodies',()=>{assert.equal(safeCategory(new Error('secret token body'),429),'rate_limit');assert.equal(safeCategory(new SyntaxError('secret')),'invalid_output');});
test('usage is nullable and cost uses explicit pricing',()=>{assert.deepEqual(usageValues({prompt_tokens:100,completion_tokens:50,total_tokens:150},'{"gpt-4o":{"input_per_million":2,"output_per_million":8}}'),{input:100,output:50,total:150,cost:0.0006});assert.equal(usageValues({},'{}').cost,null);});
test('analytics failure is isolated',async()=>{let p;schedule({waitUntil:v=>p=v},()=>{throw new Error('DB failed');});await p;});
test('Access fails closed for missing config and spoofed headers',async()=>{assert.equal(await authorized(new Request('https://admin',{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.com'}}),{}),false);assert.equal(await authorized(new Request('https://admin',{headers:{'Cf-Access-Jwt-Assertion':'a.b.c'}}),{ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ACCESS_AUD:'x',ADMIN_EMAILS:'owner@example.com'}),false);});
test('CSV prevents formula injection and quotes cells',()=>{assert.match(csv([{user:'=cmd()',value:'a"b'}]),/"'=cmd\(\)"/);assert.match(csv([{value:'a"b'}]),/"a""b"/);});
for(const provider of ['openai','cloudflare','local'])test(`SEO preserves ${provider} provider and writes allowlisted telemetry`,async()=>{
 const original=globalThis.fetch;let values;const pending=[];
 globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:4,completion_tokens:2,total_tokens:6}}));
 const env={ANALYTICS_ENABLED:'true',OPENAI_API_KEY:provider==='openai'?'test':undefined,AI:{run:async()=>{if(provider==='local')throw new Error('private body');return {response:JSON.stringify(content)};}},DB:{prepare:sql=>({bind:(...v)=>({first:async()=>({user_id:'user-1'}),run:async()=>{values=v;}})})}};
 try{const r=await worker.fetch(new Request('https://preview/api/generate-premium-seo',{method:'POST',body:JSON.stringify({topic:'Test',folder_id:1})}),env,{waitUntil:p=>pending.push(p)});const data=await r.json();await Promise.all(pending);assert.equal(r.status,200);assert.equal(data.provider,provider);assert.equal(values[1],'user-1');assert.equal(values[3],provider);assert.ok(!JSON.stringify(values).includes('private body'));}finally{globalThis.fetch=original;}
});
test('malformed SEO request still records failure without changing response',async()=>{let values;const pending=[];const r=await worker.fetch(new Request('https://preview/api/generate-premium-seo',{method:'POST',body:'{'}),{ANALYTICS_ENABLED:'true',DB:{prepare:()=>({bind:(...v)=>({run:async()=>values=v})})}},{waitUntil:p=>pending.push(p)});await Promise.all(pending);assert.equal(r.status,500);assert.equal(values[13],0);});

test('D1 schema and analytics queries run against SQLite and exclude secret columns',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0008_private_analytics.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO folders(id,user_id,name) VALUES(1,'user-1','Secret brand'); INSERT INTO accounts(user_id,platform,access_token) VALUES('user-1','youtube','SECRET_TOKEN');");
 const env={ANALYTICS_ENABLED:'true',DB:{prepare:sql=>({bind:(...v)=>({first:async()=>db.prepare(sql).get(...v),run:async()=>db.prepare(sql).run(...v),all:async()=>({results:db.prepare(sql).all(...v)})})})}};
 await storeSeo(env,{folderId:1,started:Date.now(),attempted:['openai'],provider:'openai',success:true,model:'gpt-4o',usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}});
 const {onRequestGet}=await import('../admin/functions/api/analytics.js');
 const response=await onRequestGet({request:new Request('https://admin/api/analytics'),env});assert.equal(response.status,200);const data=await response.json();assert.equal(data.users[0].youtube,1);assert.equal(data.seo.length,1);assert.equal(data.summary[0].generations,1);assert.ok(!JSON.stringify(data).includes('SECRET_TOKEN'));assert.ok(!JSON.stringify(data).includes('Secret brand'));db.close();
});
test('Access validates signature, issuer, expiry, audience and email allowlist',async()=>{
 const {privateKey,publicKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',publicKey);jwk.kid='test';
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
 const env={ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ACCESS_AUD:'admin-aud',ADMIN_EMAILS:'owner@example.com'};
 const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const sign=async(overrides={})=>{const header=enc({alg:'RS256',kid:'test'});const payload=enc({iss:'https://example.cloudflareaccess.com',aud:['admin-aud'],email:'owner@example.com',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...overrides});const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(`${header}.${payload}`));return new Request('https://admin',{headers:{'Cf-Access-Jwt-Assertion':`${header}.${payload}.${Buffer.from(signature).toString('base64url')}`}});};
 try{assert.equal(await authorized(await sign(),env),true);for(const override of [{exp:0},{aud:['wrong']},{iss:'https://evil.example'},{email:'outsider@example.com'}])assert.equal(await authorized(await sign(override),env),false);}finally{globalThis.fetch=original;}
});

test('protected auth, billing, linking and publishing implementation is unchanged',async()=>{
 const {execFileSync}=await import('node:child_process');const {readFileSync}=await import('node:fs');
 const baseline=execFileSync('git',['show','origin/main:worker.js'],{encoding:'utf8'});
 const current=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
 const start='    const requireUser =';const end='export {';
 assert.equal(current.slice(current.indexOf(start),current.indexOf('const instrumented_worker =')),baseline.slice(baseline.indexOf(start),baseline.indexOf(end)));
 const changed=execFileSync('git',['diff','origin/main','--name-only'],{encoding:'utf8'}).trim().split('\n');
 assert.ok(!changed.some(f=>/\.(html|css)$/.test(f) || ['app.js','facebook-oauth.mjs','facebook-video-readiness.mjs','youtube-auth.js','wrangler.toml'].includes(f)));
});
