import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../folder.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function setup(fetch,scope='owner@example.com') {
 const saved={},refresh=[];
 const context=vm.createContext({window:{location:{hostname:'multipostapp.co.uk'}},document:{},fetch,URLSearchParams,localStorage:{getItem:()=>null,setItem:(key,value)=>saved[key]=value}});
 vm.runInContext(script,context);
 context.identity={uid:'uid-owner',email:'owner@example.com',getIdToken:async force=>{refresh.push(Boolean(force));return 'id-token';}};
 context.initialScope=scope;
 vm.runInContext('signedInAuthUser=identity; userScope=initialScope;',context);
 return {context,saved,refresh,run:code=>vm.runInContext(code,context)};
}
test('email/UID mismatch retries only the same folder under the actual signed-in UID',async()=>{
 const calls=[];
 const f=setup(async(url,init)=>{const p=new URL(url,'https://example.test').searchParams;calls.push([p.get('folder_id'),p.get('user_id')]);assert.equal(init.headers.Authorization,'Bearer id-token');return p.get('user_id')==='uid-owner'?Response.json([{nickname:'Folder B TikTok'}]):Response.json({error:'Workspace access denied',code:'WORKSPACE_ACCESS_DENIED'},{status:403});});
 assert.equal((await f.run('fetchWorkspaceAccounts("B")'))[0].nickname,'Folder B TikTok');
 assert.deepEqual(calls,[['B','owner@example.com'],['B','uid-owner']]);assert.equal(f.run('userScope'),'uid-owner');assert.equal(f.saved.currentUserKey,'uid-owner');
});
test('stale owner alias is never sent as proof of ownership; an empty linked-account list is success',async()=>{
 const calls=[];const f=setup(async url=>{calls.push(new URL(url,'https://example.test').searchParams.get('user_id'));return Response.json([]);},'someone-else@example.com');
 assert.equal((await f.run('fetchWorkspaceAccounts("A")')).length,0);assert.deepEqual(calls,['uid-owner']);
});
test('expired Firebase token is force-refreshed once before loading the same workspace',async()=>{
 let calls=0;const f=setup(async()=>++calls===1?Response.json({error:'expired'},{status:401}):Response.json([]),'uid-owner');
 await f.run('fetchWorkspaceAccounts("A")');assert.equal(calls,2);assert.equal(f.refresh.filter(Boolean).length,1);
});
test('verification failure remains actionable and cannot be bypassed by a guessed scope',async()=>{
 const f=setup(async url=>{const email=new URL(url,'https://example.test').searchParams.get('user_id').includes('@');return Response.json({error:email?'Verify your Multi Post email address.':'Access denied',code:email?'EMAIL_VERIFICATION_REQUIRED':'WORKSPACE_ACCESS_DENIED'},{status:403});});
 await assert.rejects(f.run('fetchWorkspaceAccounts("A")'),/Verify your Multi Post email/);
 assert.equal(f.saved.currentUserKey,undefined);
});
test('network and backend failures do not fall back to another identity or folder',async()=>{
 let calls=0;const f=setup(async()=>{calls++;return Response.json({error:'Service unavailable'},{status:503});});
 await assert.rejects(f.run('fetchWorkspaceAccounts("A")'),/Service unavailable/);assert.equal(calls,1);
});
