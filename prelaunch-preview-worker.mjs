// Dedicated review entrypoint. No production DB, secrets, OAuth or payment calls.
import { beginPlatformLink, consumePlatformLink, platformLinkCookie } from './platform-link.mjs';
import { beginTikTokLink, consumeTikTokLink, saveTikTokConnection } from './tiktok-connections.mjs';
const cookie = (name, value) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control':'no-store', ...headers } });
export default {
 async fetch(request, env) {
  const url = new URL(request.url), origin = url.origin;
  if (!env.DB || env.PRELAUNCH_ISOLATED !== 'true') return new Response('Preview isolation is not configured', {status:503});
  const cookies = Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(item => item.trim().split('=')));
  let session = cookies.mp_preview_session || '';
  if (!/^[a-f0-9-]{36}$/.test(session)) {
   session = crypto.randomUUID();
   await env.DB.prepare("INSERT INTO folders (user_id,name) VALUES (?,?)").bind('preview:'+session,'Preview brand').run();
   return new Response(null, {status:302, headers:{Location:url.pathname+url.search, 'Set-Cookie':cookie('mp_preview_session',session)}});
  }
  const userId = 'preview:'+session;
  const identity = { userId, emailVerified:true };
  const body = async () => request.json().catch(() => ({}));
  const owns = async id => env.DB.prepare('SELECT id FROM folders WHERE id=? AND user_id=?').bind(String(id),userId).first();
  if (url.pathname === '/api/health') return json({ok:true, version:'2026-10-24-prelaunch-preview', isolated:true, synthetic:true, posting:false, payments:false});
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n');
  if (url.pathname === '/api/get-folders') return json((await env.DB.prepare('SELECT * FROM folders WHERE user_id=? ORDER BY id DESC').bind(userId).all()).results);
  if (url.pathname === '/api/get-accounts') {
   const id = url.searchParams.get('folder_id');
   if (!await owns(id)) return json({error:'Workspace access denied'},403);
   return json((await env.DB.prepare('SELECT id,platform,nickname,facebook_page_name FROM accounts WHERE user_id=? AND folder_id=?').bind(userId,id).all()).results,200,{'X-Workspace-Owner':userId});
  }
  if (url.pathname === '/api/add-folder' && request.method === 'POST') {
   const data = await body(); if(!String(data.name||'').trim()) return json({error:'Enter a brand name'},400);
   await env.DB.prepare('INSERT INTO folders (user_id,name) VALUES (?,?)').bind(userId,String(data.name).trim()).run();
   return json({success:true});
  }
  if (url.pathname === '/api/rename-folder' && request.method === 'POST') {
   const data=await body(); if(!await owns(data.id)) return json({error:'Workspace access denied'},403);
   await env.DB.prepare('UPDATE folders SET name=? WHERE id=? AND user_id=?').bind(String(data.name),data.id,userId).run(); return json({success:true});
  }
  if (url.pathname === '/api/billing/status') return json({success:true,billing:{enabled:false,access:true,status:'preview',reason:'isolated_preview',owner_mode:false,subscription:{},plan:{key:'pro',limits:{}},usage_today:{total:0}}});
  if (url.pathname === '/api/tiktok/creator-info') {
   if (!await owns(url.searchParams.get('folder_id'))) return json({error:'Workspace access denied'},403);
   return json({creator:{creator_nickname:'Preview TikTok',privacy_level_options:['SELF_ONLY','PUBLIC_TO_EVERYONE'],max_video_post_duration_sec:60}});
  }
  const provider = url.pathname.match(/^\/api\/auth\/(facebook|youtube|tiktok)$/)?.[1];
  if (provider) {
   if (request.method !== 'POST') return json({error:'Start from your workspace'},405);
   const data=await body(); if(!await owns(data.folder_id)) return json({error:'Workspace access denied'},403);
   if(provider==='tiktok') {
    const link=await beginTikTokLink(env.DB,{folderId:data.folder_id,userId,identity,authBase:origin+'/preview/tiktok',clientKey:'synthetic',redirectUri:origin+'/preview/callback/tiktok'});
    return json({url:origin+'/preview/authorize?provider=tiktok&state='+link.state},200,{'Set-Cookie':cookie('mp_tiktok_preview_nonce',link.browserNonce)});
   }
   const link=await beginPlatformLink(env.DB,{platform:provider,folderId:data.folder_id,userId,identity});
   return json({url:origin+'/preview/authorize?provider='+provider+'&state='+link.state},200,{'Set-Cookie':platformLinkCookie(provider,link.browserNonce,request.url).replace('Path=/api/auth','Path=/')});
  }
  if(url.pathname==='/preview/authorize') {
   const platform=url.searchParams.get('provider'), state=url.searchParams.get('state');
   if(!['facebook','youtube','tiktok'].includes(platform)||!/^([a-z]+link_)[a-f0-9-]{36}$/.test(state||'')) return json({error:'Invalid connection'},400);
   const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MultiPost — Simulated authorization</title><body style="font:18px system-ui;max-width:600px;margin:60px auto;padding:20px"><h1>Simulated ${platform} connection</h1><p>This uses synthetic accounts and cannot access your social profiles.</p><a href="/preview/callback/${platform}?state=${state}">Connect preview account</a> · <a href="/app.html">Cancel</a></body></html>`;
   return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  const callback=url.pathname.match(/^\/preview\/callback\/(facebook|youtube|tiktok)$/)?.[1];
  if(callback) {
   try {
    const state=url.searchParams.get('state')||'';
    const link=callback==='tiktok'?await consumeTikTokLink(env.DB,state,cookies.mp_tiktok_preview_nonce||''):await consumePlatformLink(env.DB,callback,state,cookies['mp_'+callback+'_link_nonce']||'');
    if(link.user_id!==userId) return json({error:'Wrong session'},403);
    if(callback==='tiktok') await saveTikTokConnection(env.DB,{folderId:link.folder_id,userId,openId:'synthetic-'+session,nickname:'Preview TikTok',accessToken:'synthetic-not-valid',scope:'preview'});
    else {
     const platform=callback==='facebook'?'facebook_page':'youtube';
     await env.DB.batch([env.DB.prepare('DELETE FROM accounts WHERE user_id=? AND folder_id=? AND platform=?').bind(userId,link.folder_id,platform),env.DB.prepare('INSERT INTO accounts (user_id,folder_id,platform,nickname,facebook_page_name) VALUES (?,?,?,?,?)').bind(userId,link.folder_id,platform,'Preview '+callback,callback==='facebook'?'Preview Facebook Page':null)]);
    }
    return new Response(null,{status:302,headers:{Location:'/folder.html?id='+link.folder_id}});
   } catch { return json({error:'Connection expired or already used. Start again from your workspace.'},400); }
  }
  if(url.pathname==='/api/facebook/pages') return json({success:false,error:'Preview account only. Real Facebook Pages are not queried.'});
  if(url.pathname.startsWith('/api/')) return json({success:false,error:'Blocked in isolated preview: no real posts, AI usage, account deletion or charges.'},403);
  // The shipped UI is exercised with per-browser synthetic identity. Firebase calls are removed here only.
  let response=await env.ASSETS.fetch(request);
  if(response.headers.get('Content-Type')?.includes('text/html')) {
   let html=await response.text();
   html=html.replace(/https:\/\/multipost-seo-worker(?:-preview)?\.alexbryant\.workers\.dev\/api/g,origin+'/api').replace(/const isProdHost = host === "multipostapp.co.uk" \|\| host === "www.multipostapp.co.uk";/g,'const isProdHost = true;');
   let bootstrap='';
   if(url.pathname==='/app.html') bootstrap=`authUser={uid:${JSON.stringify(userId)},email:"",displayName:"Preview",getIdToken:async()=>"synthetic"};userScope=${JSON.stringify(userId)};loadFolders();`;
   if(url.pathname==='/folder.html') bootstrap=`signedInAuthUser={uid:${JSON.stringify(userId)},email:"",getIdToken:async()=>"synthetic"};userScope=${JSON.stringify(userId)};initUI();render();`;
   // Keep publishing controls blocked: preview cannot transmit credentials or content.
   if(['app.html','folder.html'].includes(url.pathname.slice(1))) html=html.replace(/<script type="module">[\s\S]*?<\/script>/,`<script>${bootstrap}</script>`);
   else if(url.pathname==='/signin.html') html=html.replace(/<script type="module">[\s\S]*?<\/script>/g,'');
   else {
    const stubs=`const initializeApp=()=>({});const previewUser={uid:${JSON.stringify(userId)},email:"",displayName:"Preview account",emailVerified:true,getIdToken:async()=>"synthetic"};const getAuth=()=>({currentUser:previewUser});const onAuthStateChanged=(_auth,callback)=>queueMicrotask(()=>callback(previewUser));const signOut=async()=>{location.href="/signin.html"};const deleteUser=async()=>{throw new Error("Account deletion is blocked in preview")};`;
    html=html.replace(/import \{ initializeApp \} from "https:\/\/www\.gstatic\.com\/[^";]+";/g,stubs).replace(/import \{[^}]+\} from "https:\/\/www\.gstatic\.com\/[^";]+";/g,'');
   }
   if(url.pathname==='/signin.html') html=html.replace(/<form[\s\S]*?<\/form>/,'<p>Preview accounts need no email or password.</p><a class="btn" href="app.html">Open safe demo workspace</a>');
   if(url.pathname==='/signin.html') html=html.replace(/<button id="googleButton"[^>]*>/,'<button id="googleButton" disabled>').replace(/<a id="forgotPassword"[\s\S]*?<\/a>/,'<p>Password reset and real sign-up are disabled in this synthetic preview.</p>');
   html=html.replace('<body>' ,'<body><aside role="status" style="padding:14px;text-align:center;background:#312e81;color:white;font:14px system-ui">PREVIEW · synthetic accounts · real publishing and payments blocked · <a style="color:white" href="/app.html">Open demo workspace</a></aside>');
   response=new Response(html,{status:response.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
  }
  return response;
 }
};
