import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import worker from '../worker.js';
const originalSource=execFileSync('git',['show','origin/main:worker.js'],{encoding:'utf8'}).replaceAll('"./facebook-video-readiness.mjs"',JSON.stringify(pathToFileURL(new URL('../facebook-video-readiness.mjs',import.meta.url).pathname).href)).replaceAll('"./facebook-oauth.mjs"',JSON.stringify(pathToFileURL(new URL('../facebook-oauth.mjs',import.meta.url).pathname).href));
const baseline=(await import(`data:text/javascript;base64,${Buffer.from(originalSource).toString('base64')}`)).default;
const content={youtube:{title:'fixture',description:'fixture',keywords:'fixture'},facebook:{title:'fixture',descriptionAndTags:'fixture'},tiktok:{allInOne:'fixture'}};
const db={prepare:sql=>({bind:(...values)=>({first:async()=>sql.includes('folders')?{user_id:'test-user'}:null,all:async()=>({results:[]}),run:async()=>{if(sql.includes('analytics_'))throw Error('Telemetry database intentionally unavailable');return {success:true};}})})};
for(const path of ['/api/youtube/init-upload','/api/youtube/upload-chunk','/api/youtube/upload','/api/facebook/init-upload','/api/facebook/upload-chunk','/api/facebook/finish-upload','/api/facebook/upload-image','/api/facebook/upload','/api/tiktok/init-upload','/api/tiktok/upload-chunk','/api/tiktok/publish-status','/api/facebook/video-status','/api/auth/youtube','/api/auth/tiktok','/api/auth/facebook','/api/auth/callback/youtube','/api/auth/callback/tiktok','/api/auth/callback/facebook']) {
 test(`unchanged auth/publishing response with unavailable analytics: ${path}`,async()=>{
   const isGet=path.includes('status')||path.includes('/auth/');
   const init=isGet?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
   const env={DB:db,ANALYTICS_ENABLED:'true',WEB_BILLING_ENABLED:'false'};const pending=[];
   const a=await baseline.fetch(new Request('https://multipostapp.co.uk'+path,init),env);
   const b=await worker.fetch(new Request('https://multipostapp.co.uk'+path,init),env,{waitUntil:p=>pending.push(p)});
   assert.equal(b.status,a.status);assert.deepEqual([...b.headers],[...a.headers]);assert.equal(await b.text(),await a.text());await Promise.all(pending);
 });
}
for(const endpoint of ['generate-seo','generate-premium-seo'])for(const image of [false,true])for(const scenario of ['openai','cloudflare','local','openai-failed-output']) {
 test(`unchanged SEO response/provider request with failed analytics: ${endpoint}/${image}/${scenario}`,async()=>{
  const oldFetch=globalThis.fetch;const requests=[];
  globalThis.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));return Response.json({choices:[{message:{content:scenario==='openai-failed-output'?'invalid':JSON.stringify(content)}}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}});};
  const env={DB:db,ANALYTICS_ENABLED:'true',OPENAI_API_KEY:scenario.startsWith('openai')?'fixture':undefined,AI:{run:async()=>{if(scenario==='local')throw Error('fixture provider failure');return {response:JSON.stringify(content)};}}};
  const payload=endpoint==='generate-seo'?{prompt:'Fixture topic',folder_id:1,...(image?{image_base64:'AA==',image_filename:'fixture.jpg'}:{})}:{topic:'Fixture topic',folder_id:1,...(image?{image_url:'data:image/jpeg;base64,AA=='}:{})};
  const init={method:'POST',body:JSON.stringify(payload)};const pending=[];
  try{const a=await baseline.fetch(new Request('https://multipostapp.co.uk/api/'+endpoint,init),env);const b=await worker.fetch(new Request('https://multipostapp.co.uk/api/'+endpoint,init),env,{waitUntil:p=>pending.push(p)});assert.equal(b.status,a.status);assert.deepEqual([...b.headers],[...a.headers]);assert.deepEqual(await b.json(),await a.json());await Promise.all(pending);if(requests.length)assert.deepEqual(requests[0],requests[1]);}finally{globalThis.fetch=oldFetch;}
 });
}
test('production config changes only analytics flags',()=>{
 const before=execFileSync('git',['show','origin/main:wrangler.toml'],{encoding:'utf8'});
 const after=execFileSync('git',['diff','origin/main','--','wrangler.toml'],{encoding:'utf8'});
 const additions=after.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++'));
 assert.equal(additions.length,2);assert.ok(additions.every(l=>l.startsWith('+ANALYTICS_')));assert.ok(before.includes('WEB_BILLING_ENABLED = "false"'));
});
for(const platform of ['facebook','tiktok'])for(const complete of [false,true]) {
 test(`unchanged ${platform} publishing status with analytics database unavailable: ${complete}`,async()=>{
  const oldFetch=globalThis.fetch,requests=[];
  const fixtureDb={prepare:sql=>({bind:()=>({first:async()=>sql.includes('upload_sessions')?{access_token:'fixture-token',video_id:'fixture-video'}:sql.includes('facebook_page_access_token')?{facebook_page_id:'fixture-page',facebook_page_access_token:'fixture-token'}:{user_id:'test-user'},run:async()=>{if(sql.includes('analytics_'))throw Error('Telemetry unavailable');return {success:true};}})})};
  globalThis.fetch=async(url,init)=>{requests.push({url,init});return Response.json(platform==='tiktok'?{error:{code:'ok'},data:{status:complete?'PUBLISH_COMPLETE':'PROCESSING_UPLOAD',share_url:'https://www.tiktok.com/fixture'}}:{id:'fixture-video',permalink_url:complete?'https://www.facebook.com/fixture':'',status:{video_status:complete?'ready':'processing'}});};
  const path=platform==='tiktok'?'/api/tiktok/publish-status?publishId=fixture-video':'/api/facebook/video-status?videoId=fixture-video';
  const env={DB:fixtureDb,ANALYTICS_ENABLED:'true'},init={headers:{folder_id:'1',user_id:'test-user'}},pending=[];
  try{const a=await baseline.fetch(new Request('https://multipostapp.co.uk'+path,init),env);const b=await worker.fetch(new Request('https://multipostapp.co.uk'+path,init),env,{waitUntil:p=>pending.push(p)});assert.equal(a.status,200);assert.equal(b.status,a.status);assert.deepEqual([...b.headers],[...a.headers]);assert.deepEqual(await b.json(),await a.json());await Promise.all(pending);assert.deepEqual(requests[0],requests[1]);}finally{globalThis.fetch=oldFetch;}
 });
}
