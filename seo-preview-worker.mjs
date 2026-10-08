import { generateSeo, makeLocalFallback, normalizeSeoInput, SEO_MODELS } from "./services/seoEngine.mjs";

const CASES = [
  "FIFA Street 2 PS2 gameplay featuring street football skills and matches",
  "A family-run bakery in Leeds showing how its sourdough is shaped by hand each morning",
  "A compact rechargeable desk fan with three speed settings and a foldable stand",
  "Tutorial: replace a bicycle inner tube using tyre levers and a hand pump",
  "A quiet morning walk through autumn woodland with close-up shots of mushrooms and leaves",
  "A small-business guide to photographing handmade jewellery beside a window using a phone"
];
const BENCHMARK_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
];

function authorized(request, env) {
  const cookie = request.headers.get("cookie") || "";
  return Boolean(env.PREVIEW_ACCESS_TOKEN) && cookie.split(/;\s*/).includes(`seo_preview=${env.PREVIEW_ACCESS_TOKEN}`);
}

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function page() {
  const cases = CASES.map((value, index) => `<option value="${index}">${value}</option>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Multi Post SEO comparison</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#e5edf7;background:#07111f}body{max-width:1180px;margin:0 auto;padding:32px 18px 60px}h1{margin-bottom:6px}.sub{color:#9fb0c5;margin-top:0}.controls,.card{background:#101d2e;border:1px solid #26384f;border-radius:14px;padding:18px}.controls{display:grid;gap:12px;margin:24px 0}textarea,select,button{font:inherit;border-radius:9px;border:1px solid #3a4d66;padding:11px;background:#0a1626;color:#e5edf7}textarea{min-height:86px;resize:vertical}button{background:#2563eb;border:0;font-weight:700;cursor:pointer}button:disabled{opacity:.55}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.provider{font-weight:800}.meta{font-size:13px;color:#93a7be;margin:6px 0 14px}.section{border-top:1px solid #26384f;padding-top:10px;margin-top:10px}.label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#7dd3fc}.value{white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#fda4af}@media(max-width:850px){.grid{grid-template-columns:1fr}}</style></head><body>
  <h1>Multi Post SEO provider comparison</h1><p class="sub">Private, isolated preview. It has no production database, publishing, OAuth or billing bindings.</p>
  <div class="controls"><label>Test case<select id="case">${cases}</select></label><label>Content description<textarea id="topic">${CASES[0]}</textarea></label><button id="run">Compare OpenAI, Cloudflare and local fallback</button><div id="status"></div></div>
  <div id="results" class="grid"></div>
  <script>
  const cases=${JSON.stringify(CASES)};const topic=document.querySelector('#topic');document.querySelector('#case').onchange=e=>topic.value=cases[+e.target.value];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function card(name,result){if(result.error)return '<article class="card"><div class="provider">'+esc(name)+'</div><p class="error">'+esc(result.error)+'</p></article>';const d=result.data,m=result.telemetry||{};return '<article class="card"><div class="provider">'+esc(name)+'</div><div class="meta">'+esc(m.model||'deterministic')+' · '+esc(m.durationMs||0)+' ms · '+esc(m.attempts||0)+' attempt(s)</div>'+[['YouTube title',d.youtube.title],['YouTube description',d.youtube.description],['YouTube keywords',d.youtube.keywords],['TikTok',d.tiktok.allInOne],['Facebook title',d.facebook.title],['Facebook',d.facebook.descriptionAndTags]].map(x=>'<div class="section"><div class="label">'+x[0]+'</div><div class="value">'+esc(x[1])+'</div></div>').join('')+'</article>'}
  document.querySelector('#run').onclick=async()=>{const btn=document.querySelector('#run'),status=document.querySelector('#status');btn.disabled=true;status.textContent='Generating all three versions…';document.querySelector('#results').innerHTML='';try{const r=await fetch('/api/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic:topic.value})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');document.querySelector('#results').innerHTML=card('OpenAI primary',j.openai)+card('Cloudflare fallback',j.cloudflare)+card('Local emergency fallback',j.local);status.textContent='Comparison complete.'}catch(e){status.textContent=e.message}finally{btn.disabled=false}};
  </script></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("token") && url.searchParams.get("token") === env.PREVIEW_ACCESS_TOKEN) {
      return new Response(null, { status: 302, headers: { location: url.origin, "set-cookie": `seo_preview=${env.PREVIEW_ACCESS_TOKEN}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`, "cache-control": "no-store" } });
    }
    if (!authorized(request, env)) return new Response("Private preview", { status: 401, headers: { "cache-control": "no-store" } });
    if (url.pathname === "/api/health") return new Response(JSON.stringify({ ok: true, isolated: true, databaseBound: false, models: SEO_MODELS }), { headers });
    if (url.pathname === "/api/compare" && request.method === "POST") {
      try {
        const input = await normalizeSeoInput(await request.json());
        if (!input.topic.trim()) return new Response(JSON.stringify({ error: "Enter a content description" }), { status: 400, headers });
        const [openai, cloudflare] = await Promise.allSettled([
          generateSeo(env, input, { provider: "openai" }),
          generateSeo(env, input, { provider: "cloudflare" })
        ]);
        const normalize = (result) => result.status === "fulfilled" ? result.value : { error: String(result.reason?.message || result.reason) };
        return new Response(JSON.stringify({
          openai: normalize(openai),
          cloudflare: normalize(cloudflare),
          local: { data: makeLocalFallback(input.topic), telemetry: { provider: "local", model: "deterministic-v2", attempts: 0, durationMs: 0 } }
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 500, headers });
      }
    }
    if (url.pathname === "/api/model-benchmark" && request.method === "POST") {
      try {
        const input = await normalizeSeoInput(await request.json());
        const results = await Promise.allSettled(BENCHMARK_MODELS.map((cloudflareModel) => generateSeo(env, input, { provider: "cloudflare", cloudflareModel })));
        return new Response(JSON.stringify(Object.fromEntries(BENCHMARK_MODELS.map((model, index) => [model, results[index].status === "fulfilled" ? results[index].value : { error: String(results[index].reason?.message || results[index].reason) }]))), { headers });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 500, headers });
      }
    }
    if (url.pathname !== "/") return new Response("Not found", { status: 404 });
    return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  }
};
