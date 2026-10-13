// Isolated preview only. Synthetic TikTok provider; never deploy as the production entrypoint.
import worker from './worker.js';
import { beginTikTokLink, consumeTikTokLink, saveTikTokConnection, tikTokPublishingAccount, disconnectTikTok } from './tiktok-connections.mjs';
const cookie = (name,value,path='/') => `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`;
const cookies = request => Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(x=>x.trim().split('=')));
const redirect = (url, setCookie) => new Response(null,{status:302,headers:{Location:url,...(setCookie?{'Set-Cookie':setCookie}:{})}});
const escape = text => String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(body) { return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Multi Post · TikTok preview</title><style>body{background:#0b1020;color:#eee;font:17px system-ui;max-width:850px;margin:50px auto;padding:20px}a{color:#a6b4ff}button,select{font:inherit;padding:12px;border-radius:8px}section{padding:22px;background:#171e34;border-radius:14px;margin:20px 0}.tag{color:#bbc5f2}h1{font-size:32px}p{line-height:1.6}</style>${body}</html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}}); }
export default {
  async fetch(request, env) {
    const url=new URL(request.url), origin=url.origin, c=cookies(request);
    const isolated={...env,BASE_URL:origin,FRONTEND_URL:origin,TIKTOK_AUTH_BASE_URL:origin+'/mock-tiktok',TIKTOK_API_BASE_URL:origin+'/mock-tiktok'};
    if(url.pathname==='/api/health') return worker.fetch(request,isolated);
    // Public, per-browser fixture demo using the same connection persistence and state helpers.
    if(url.pathname==='/' || url.pathname.startsWith('/demo')) {
      if(!c.fixture_session) {
        const session=crypto.randomUUID();
        await env.DB.batch(['Workspace A','Workspace B'].map(name=>env.DB.prepare('INSERT INTO folders (user_id,name) VALUES (?,?)').bind('fixture:'+session,name)));
        return redirect('/demo',cookie('fixture_session',session));
      }
      const userId='fixture:'+c.fixture_session;
      const folders=(await env.DB.prepare('SELECT id,name FROM folders WHERE user_id = ? ORDER BY id').bind(userId).all()).results;
      if(request.method==='POST' && url.pathname==='/demo/connect') {
        const form=await request.formData();
        const link=await beginTikTokLink(env.DB,{folderId:String(form.get('folder')),userId,identity:{userId},authBase:origin+'/mock-tiktok',clientKey:'fixture',redirectUri:origin+'/demo/callback'});
        return redirect(link.url,cookie('fixture_nonce',link.browserNonce));
      }
      if(url.pathname==='/demo/callback') {
        try {
          const link=await consumeTikTokLink(env.DB,url.searchParams.get('state')||'',c.fixture_nonce||'');
          if(link.user_id!==userId) return new Response('Wrong browser session',{status:403});
          const account=url.searchParams.get('code');
          if(!['alice','bob'].includes(account)) return redirect('/demo?notice=Authorization+cancelled.+Existing+links+unchanged.');
          const duplicate=await env.DB.prepare("SELECT id FROM accounts WHERE user_id=? AND tiktok_open_id=? AND folder_id!=?").bind(userId,account,link.folder_id).first();
          if(duplicate) return redirect('/demo?notice=TikTok+returned+the+account+already+in+another+workspace.+Switch+accounts+and+try+again.');
          await saveTikTokConnection(env.DB,{folderId:link.folder_id,userId,openId:account,nickname:'@'+account,accessToken:'fixture-token-'+account,refreshToken:null,expiresAt:Date.now()+3600000,scope:'fixture'});
          return redirect('/demo?notice=Connected.+Check+the+workspace+account+below.');
        } catch {return new Response('Invalid or expired connection',{status:400});}
      }
      if(request.method==='POST' && url.pathname==='/demo/disconnect') {
        const form=await request.formData();
        await disconnectTikTok(env.DB,Number(form.get('account')),userId);
        return redirect('/demo?notice=Disconnected.+Other+workspace+unchanged.');
      }
      if(request.method==='POST' && url.pathname==='/demo/publish') {
        const form=await request.formData();
        const account=await tikTokPublishingAccount(env.DB,String(form.get('folder')),userId);
        return redirect('/demo?notice='+encodeURIComponent(account ? 'Simulated publish target: @'+account.tiktok_open_id+'. No real content was published.' : 'No linked TikTok account. Publishing is blocked.'));
      }
      let cards='';
      for(const folder of folders) {
        const account=await tikTokPublishingAccount(env.DB,String(folder.id),userId);
        cards+=`<section><h2>${escape(folder.name)}</h2><p>Connected TikTok: <strong>${escape(account?.nickname||'Not linked')}</strong></p><form method="post" action="/demo/connect"><input type="hidden" name="folder" value="${folder.id}"><button>${account?'Connect another TikTok account':'Connect TikTok account'}</button></form>${account?`<form method="post" action="/demo/disconnect"><input type="hidden" name="account" value="${account.id}"><button>Remove connection</button></form>`:''}<form method="post" action="/demo/publish"><input type="hidden" name="folder" value="${folder.id}"><button>Check publishing target</button></form></section>`;
      }
      return page(`<p class="tag">ISOLATED CLOUDFLARE PREVIEW · SYNTHETIC ACCOUNTS ONLY</p><h1>Different TikTok accounts in each workspace</h1><p>This review demo uses the fix’s actual state and database helpers with fake TikTok identities and its own database. It cannot publish to real TikTok or modify production accounts. Each browser has its own fixture workspaces.</p><p role="status">${escape(url.searchParams.get('notice'))}</p>${cards}<p>Try Alice in A, then Alice in B to see the switch warning. Choose Bob in B and check both publishing targets. Reconnect or remove A to verify B stays linked.</p><p><a href="/signin.html">Open the application preview</a> (real Multi Post sign-in, isolated database, synthetic TikTok provider; Google/Facebook/SEO/billing disabled here).</p>`);
    }
    if(url.pathname==='/mock-tiktok/v2/auth/authorize/') {
      return page(`<h1>Choose your TikTok account</h1><p>This screen represents TikTok’s authorization page. TikTok may use your browser’s signed-in account. On the real service, open tiktok.com and switch or log out before continuing.</p><p>Preview provider session: <strong>@${escape(c.mock_account||'alice')}</strong></p><form action="/mock-tiktok/consent" method="post"><input type="hidden" name="state" value="${escape(url.searchParams.get('state'))}"><input type="hidden" name="redirect" value="${escape(url.searchParams.get('redirect_uri'))}"><select name="account"><option value="alice" ${c.mock_account!=='bob'?'selected':''}>@alice</option><option value="bob" ${c.mock_account==='bob'?'selected':''}>@bob</option><option value="cancel">Cancel authorization</option></select><button>Continue</button></form>`);
    }
    if(url.pathname==='/mock-tiktok/consent' && request.method==='POST') {
      const f=await request.formData(), destination=new URL(String(f.get('redirect')));
      if(destination.origin!==origin || !['/demo/callback','/api/auth/callback/tiktok'].includes(destination.pathname)) return new Response('Invalid redirect',{status:400});
      const account=String(f.get('account'));
      if(!['alice','bob','cancel'].includes(account)) return new Response('Invalid fixture',{status:400});
      destination.search=new URLSearchParams({state:String(f.get('state')),...(account==='cancel'?{error:'access_denied'}:{code:account})});
      return redirect(destination.href,cookie('mock_account',account==='cancel'?'alice':account));
    }
    if(url.pathname==='/mock-tiktok/v2/oauth/token/') {
      const f=await request.formData(), account=String(f.get('code'));
      if(!['alice','bob'].includes(account)) return Response.json({error:'invalid_grant'},{status:400});
      return Response.json({access_token:'fixture-token-'+account,refresh_token:'fixture-refresh-'+account,open_id:account,expires_in:3600});
    }
    if(url.pathname==='/mock-tiktok/v2/user/info/') return Response.json({data:{user:{display_name:'@'+(request.headers.get('Authorization')||'').replace('Bearer fixture-token-','')}}});
    if(url.pathname.startsWith('/api/')) {
      // No real posting, provider logins, subscriptions, or SEO calls from this preview.
      if(!['/api/auth/tiktok','/api/auth/callback/tiktok','/api/get-folders','/api/add-folder','/api/rename-folder','/api/delete-folder','/api/get-accounts'].includes(url.pathname)) return Response.json({error:'Disabled in isolated TikTok preview'},{status:403});
      return worker.fetch(request,isolated);
    }
    if(url.pathname==='/sw.js') return new Response('// Service worker disabled in isolated preview',{headers:{'Content-Type':'application/javascript'}});
    const asset=await env.ASSETS.fetch(request);
    if(asset.headers.get('Content-Type')?.includes('text/html')) {
      const text=(await asset.text()).replace(/https:\/\/multipost-seo-worker(?:-preview)?\.alexbryant\.workers\.dev\/api/g,origin+'/api').replace(/const isProdHost = host === "multipostapp.co.uk" \|\| host === "www.multipostapp.co.uk";/g,'const isProdHost = true;');
      return new Response(text,{status:asset.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    return asset;
  }
};
