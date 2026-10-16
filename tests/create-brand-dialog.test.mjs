import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../app.html',import.meta.url),'utf8');
function setup(fetch) {
  const listeners={};
  const elements=Object.fromEntries(['createBrandDialog','createBrandTitle','brandName','createBrandError','saveBrandButton','cancelBrandButton'].map(id=>[id,{value:'',disabled:false,textContent:'',open:false,showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,fn){listeners[name]=fn;}}]));
  const context=vm.createContext({document:{getElementById:id=>elements[id]},window:{location:{hostname:'multipostapp.co.uk'}},fetch,prompt(){throw new Error('prompt() is not supported.');}});
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  vm.runInContext('userScope="owner"; let reloadCount=0; loadFolders=async()=>{reloadCount++}',context);
  return {elements,context,listeners,run:code=>vm.runInContext(code,context)};
}
const submit='submitNewFolder({preventDefault(){}})';
test('create brand opens an on-page form when native prompts are unsupported; cancel sends no request',()=>{
  let calls=0;const f=setup(()=>{calls++;});
  f.run('createNewFolder()');assert.equal(f.elements.createBrandDialog.open,true);
  f.elements.brandName.value='unfinished';f.elements.createBrandError.textContent='old error';
  f.elements.createBrandDialog.close();assert.equal(calls,0);
  f.run('createNewFolder()');assert.equal(f.elements.brandName.value,'');assert.equal(f.elements.createBrandError.textContent,'');
});
test('empty names and missing sign-in fail in the form before requesting creation',async()=>{
  let calls=0;const f=setup(()=>{calls++;});
  f.elements.brandName.value='   ';await f.run(submit);assert.match(f.elements.createBrandError.textContent,/Enter a brand/);
  f.elements.brandName.value='My brand';f.run('userScope=null');await f.run(submit);assert.match(f.elements.createBrandError.textContent,/Sign in/);assert.equal(calls,0);
});
test('create sends the trimmed name and selected user once; refreshes brands after success',async()=>{
  let finish,calls=0,body;const f=setup(async(url,init)=>{calls++;assert.equal(url,'/api/add-folder');body=JSON.parse(init.body);return new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({success:true})}));});
  f.run('createNewFolder()');f.elements.brandName.value='  TikTok Brand B  ';
  const pending=f.run(submit);assert.equal(f.elements.saveBrandButton.disabled,true);assert.equal(f.elements.cancelBrandButton.disabled,true);
  await f.run(submit);assert.equal(calls,1);assert.deepEqual(body,{name:'TikTok Brand B',user_id:'owner'});
  let prevented=false;f.listeners.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  finish();await pending;assert.equal(f.elements.createBrandDialog.open,false);assert.equal(f.run('reloadCount'),1);assert.equal(f.elements.saveBrandButton.disabled,false);
});
test('server errors stay visible and preserve the entered name for correction',async()=>{
  const f=setup(async()=>({ok:false,json:async()=>({success:false,error:'Service unavailable'})}));
  f.run('createNewFolder()');f.elements.brandName.value='My brand';await f.run(submit);
  assert.equal(f.elements.createBrandDialog.open,true);assert.equal(f.elements.brandName.value,'My brand');assert.equal(f.elements.createBrandError.textContent,'Service unavailable');assert.equal(f.elements.saveBrandButton.disabled,false);assert.equal(f.run('reloadCount'),0);
});
test('rename uses the same on-page name form and the workspace owner identity',async()=>{
  let url,body,authorization;const f=setup(async(requestUrl,init)=>{url=requestUrl;body=JSON.parse(init.body);authorization=init.headers.Authorization;return {ok:true,json:async()=>({success:true})};});
  f.run('authUser={getIdToken:async()=>"rename-token"}; openRenameFolder("42","legacy-owner@example.com","Old name")');
  assert.equal(f.elements.createBrandDialog.open,true);assert.equal(f.elements.createBrandTitle.textContent,'Rename Brand');assert.equal(f.elements.brandName.value,'Old name');
  f.elements.brandName.value='New name';await f.run(submit);
  assert.equal(url,'/api/rename-folder');assert.deepEqual(body,{id:'42',name:'New name',user_id:'legacy-owner@example.com'});assert.equal(authorization,'Bearer rename-token');
});
