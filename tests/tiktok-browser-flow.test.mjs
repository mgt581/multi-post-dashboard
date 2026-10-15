import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { tikTokLinkCookie } from '../tiktok-connections.mjs';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
function dispatch(source, request) {
  const listeners = {};
  let intercepted;
  vm.runInNewContext(source, {
    self: { location: { origin: new URL(request.url).origin }, addEventListener: (name, fn) => listeners[name] = fn },
    URL, Response, Headers,
  });
  listeners.fetch({ request, respondWith: value => intercepted = value });
  return intercepted;
}
test('service worker leaves OAuth POST and callbacks to the browser, preserving method, body and origin cookies', async () => {
  for (const host of ['multipostapp.co.uk','www.multipostapp.co.uk']) {
    const start = new Request(`https://${host}/api/auth/tiktok`, { method:'POST', body:JSON.stringify({folder_id:'B',user_id:'owner'}), headers:{Authorization:'Bearer test'} });
    assert.equal(dispatch(sw,start),undefined);
    assert.deepEqual(await start.json(),{folder_id:'B',user_id:'owner'});
    assert.equal(dispatch(sw,new Request(`https://${host}/api/auth/callback/tiktok?code=once&state=bound`)),undefined);
    assert.equal(dispatch(sw,new Request(`https://${host}/api/auth/youtube?folder_id=B`)),undefined);
  }
});
test('regression fixture reproduces the old service worker redirect that loses POST semantics', () => {
  const broken = readFileSync(new URL('./fixtures/oauth-baseline-sw.js',import.meta.url),'utf8');
  const result = dispatch(broken,new Request('https://multipostapp.co.uk/api/auth/tiktok',{method:'POST',body:'{"folder_id":"B"}'}));
  assert.equal(result.status,302);
  assert.equal(new URL(result.headers.get('Location')).hostname,'multipost-seo-worker.alexbryant.workers.dev');
});
test('link nonce follows www to the registered apex callback, while isolated hosts stay host-only', () => {
  for (const host of ['multipostapp.co.uk','www.multipostapp.co.uk']) {
    assert.match(tikTokLinkCookie('nonce',600,`https://${host}/api/auth/tiktok`),/; Domain=multipostapp.co.uk$/);
    assert.match(tikTokLinkCookie('',0,`https://${host}/api/auth/callback/tiktok`),/Max-Age=0.*Domain=multipostapp.co.uk$/);
  }
  for (const host of ['preview.workers.dev','multipostapp.co.uk.attacker.test','localhost']) {
    assert.doesNotMatch(tikTokLinkCookie('nonce',600,`https://${host}/`),/Domain=/);
  }
});
test('different-account path cannot authorize until switching is acknowledged; reopening resets confirmation', async () => {
  const html = readFileSync(new URL('../folder.html',import.meta.url),'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = Object.fromEntries(['tiktokContinue','tiktokSwitchSteps','tiktokSwitched','tiktokConnectError','tiktokCurrentAccount','tiktokSwitchDialog'].map(id=>[id,{disabled:false,checked:false,showModal(){this.open=true;}}]));
  const radio = {value:'switch',checked:true};
  const document = {getElementById:id=>elements[id],querySelector:()=>radio};
  let calls=0;
  const context = vm.createContext({document,window:{location:{hostname:'multipostapp.co.uk',search:'?id=B'}},URLSearchParams,localStorage:{getItem:()=>null},fetch:async()=>{calls++;throw new Error('network failed');}});
  vm.runInContext(script,context);
  vm.runInContext('userScope="owner"',context);
  await vm.runInContext('addAccount("tiktok")',context);
  assert.equal(elements.tiktokContinue.disabled,true);
  await vm.runInContext('continueTikTokConnection()',context);
  assert.equal(calls,0);
  elements.tiktokSwitched.checked=true;
  await vm.runInContext('continueTikTokConnection()',context);
  assert.equal(calls,1);
  assert.equal(elements.tiktokConnectError.textContent,'network failed');
  await vm.runInContext('addAccount("tiktok")',context);
  assert.equal(elements.tiktokSwitched.checked,false);
  assert.equal(elements.tiktokContinue.disabled,true);
  radio.value='current';
  vm.runInContext('updateTikTokSwitch()',context);
  assert.equal(elements.tiktokContinue.disabled,false);
  assert.equal(elements.tiktokSwitchSteps.hidden,true);
});
