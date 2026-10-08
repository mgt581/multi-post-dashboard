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
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap');
  :root{font-family:'DM Sans',system-ui,sans-serif;color:#172033;background:#f7f7fb;--ink:#172033;--muted:#6b7280;--line:#e6e8ef;--blue:#3867ed;--violet:#7c3aed;--green:#0f9f6e}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0%,#e8edff 0,transparent 32%),radial-gradient(circle at 88% 2%,#f0e8ff 0,transparent 31%),#f7f7fb;min-height:100vh}.shell{max-width:1320px;margin:auto;padding:34px 24px 72px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:34px}.brand{display:flex;align-items:center;gap:12px;font:800 18px Manrope}.mark{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--violet));color:white;display:grid;place-items:center;box-shadow:0 8px 22px #5768d833}.private{font-size:13px;color:#526078;background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 12px}.hero{text-align:center;max-width:760px;margin:0 auto 28px}.hero h1{font:800 clamp(30px,4vw,48px) Manrope;margin:0;letter-spacing:-.04em}.hero p{color:var(--muted);font-size:17px;line-height:1.6}.input-card,.provider-card{background:rgba(255,255,255,.92);border:1px solid var(--line);box-shadow:0 18px 60px #27314d10;border-radius:20px}.input-card{padding:22px;margin-bottom:22px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wide{grid-column:1/-1}label{display:grid;gap:7px;font-weight:600;font-size:14px;color:#364152}textarea,input,select{width:100%;font:inherit;color:var(--ink);background:white;border:1px solid #d7dbe5;border-radius:11px;padding:12px 13px;outline:none}textarea{min-height:94px;resize:vertical}textarea:focus,input:focus,select:focus{border-color:#7895f5;box-shadow:0 0 0 3px #dfe7ff}.hint{font-size:12px;color:#8a93a4;font-weight:400}.providers{display:grid;grid-template-columns:1fr 1fr;gap:20px}.provider-card{overflow:hidden}.provider-head{padding:20px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:14px}.provider-name{font:800 19px Manrope}.provider-note{font-size:13px;color:var(--muted);margin-top:3px}.badge{font-size:11px;font-weight:700;padding:6px 9px;border-radius:999px}.openai .badge{background:#e7f8f1;color:#087653}.cloudflare .badge{background:#fff1e5;color:#bd570d}.generate{width:calc(100% - 40px);margin:18px 20px 0;border:0;border-radius:11px;padding:13px 16px;color:white;font:700 14px 'DM Sans';cursor:pointer;transition:.18s transform,.18s opacity}.generate:hover{transform:translateY(-1px)}.generate:disabled{opacity:.55;cursor:wait;transform:none}.openai .generate{background:linear-gradient(135deg,#0d9f76,#087f61)}.cloudflare .generate{background:linear-gradient(135deg,#f97316,#e0520b)}.result{padding:20px;min-height:360px}.empty{height:300px;display:grid;place-items:center;text-align:center;color:#99a1af}.empty-icon{font-size:34px;margin-bottom:8px}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.meta span{font-size:12px;background:#f2f4f8;border-radius:999px;padding:6px 9px;color:#536074}.platform{border-top:1px solid var(--line);padding:16px 0 2px}.platform:first-of-type{border-top:0}.platform-title{font:700 14px Manrope;color:#25304a;margin-bottom:10px}.field{margin:10px 0}.field-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#8a93a4;font-weight:700}.field-value{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;margin-top:3px;font-size:14px}.error{margin:18px 20px 22px;background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;border-radius:12px;padding:14px;line-height:1.5}.loading{padding:42px 20px;text-align:center;color:#687386}.spinner{width:28px;height:28px;border:3px solid #e0e5ee;border-top-color:#6878ef;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}.security{margin-top:20px;text-align:center;color:#8a93a4;font-size:12px}@media(max-width:850px){.providers,.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}.topbar{align-items:flex-start;flex-direction:column}}
  </style></head><body><main class="shell">
  <div class="topbar"><div class="brand"><div class="mark">MP</div>Multi Post Labs</div><div class="private">🔒 Private isolated preview</div></div>
  <section class="hero"><h1>Compare your SEO generators</h1><p>Give both providers the same content details, then run either generator independently. Results are never substituted between providers.</p></section>
  <section class="input-card"><div class="form-grid">
    <label>Example scenario<select id="case">${cases}</select></label>
    <label>Content type<select id="type"><option>Video</option><option>Image</option><option>Short / Reel</option><option>Tutorial</option><option>Product</option></select></label>
    <label class="wide">Main content details<textarea id="topic">${CASES[0]}</textarea><span class="hint">Describe only details that are genuinely present in the content.</span></label>
    <label>Visual details or key moments<textarea id="visual" placeholder="Example: Night match, rainbow flick, close-up replay"></textarea></label>
    <label>Brand, channel or business name<textarea id="brand" placeholder="Optional account context"></textarea></label>
  </div></section>
  <section class="providers">
    <article class="provider-card openai"><div class="provider-head"><div><div class="provider-name">OpenAI GPT-4o</div><div class="provider-note">Paid primary generator</div></div><span class="badge">PRIMARY</span></div><button class="generate" data-provider="openai">Generate with OpenAI GPT-4o</button><div id="openai-result" class="result"><div class="empty"><div><div class="empty-icon">✦</div>Enter your details and run OpenAI.</div></div></div></article>
    <article class="provider-card cloudflare"><div class="provider-head"><div><div class="provider-name">Cloudflare Llama 3.3 70B</div><div class="provider-note">Improved fallback generator</div></div><span class="badge">FALLBACK</span></div><button class="generate" data-provider="cloudflare">Generate with Cloudflare Llama 3.3 70B</button><div id="cloudflare-result" class="result"><div class="empty"><div><div class="empty-icon">◈</div>Enter your details and run Cloudflare.</div></div></div></article>
  </section><p class="security">No database · No publishing · No OAuth · No billing · No production deployment</p>
  <script>
  const cases=${JSON.stringify(CASES)};const topic=document.querySelector('#topic');document.querySelector('#case').onchange=e=>topic.value=cases[+e.target.value];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(result){const d=result.data,m=result.telemetry||{};return '<div class="meta"><span>Provider: '+esc(result.provider)+'</span><span>Model: '+esc(m.model)+'</span><span>Response: '+esc(m.durationMs)+' ms</span><span>Attempts: '+esc(m.attempts)+'</span></div>'+platform('YouTube',[['Title',d.youtube.title],['Description',d.youtube.description],['Keywords',d.youtube.keywords]])+platform('TikTok',[['Caption & hashtags',d.tiktok.allInOne]])+platform('Facebook',[['Title',d.facebook.title],['Description & hashtags',d.facebook.descriptionAndTags]])}
  function platform(name,fields){return '<div class="platform"><div class="platform-title">'+name+'</div>'+fields.map(x=>'<div class="field"><div class="field-label">'+x[0]+'</div><div class="field-value">'+esc(x[1])+'</div></div>').join('')+'</div>'}
  async function generate(provider,button){const target=document.querySelector('#'+provider+'-result');const details=[document.querySelector('#topic').value.trim(),document.querySelector('#visual').value.trim()&&'Visual details: '+document.querySelector('#visual').value.trim(), 'Content type: '+document.querySelector('#type').value].filter(Boolean).join('\n');if(!details.trim()){target.innerHTML='<div class="error">Enter content details first.</div>';return}button.disabled=true;target.innerHTML='<div class="loading"><div class="spinner"></div>Generating with '+(provider==='openai'?'OpenAI GPT-4o':'Cloudflare Llama 3.3 70B')+'…</div>';try{const response=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider,topic:details,folder_name:document.querySelector('#brand').value.trim()})});const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Request failed with '+response.status);if(result.provider!==provider)throw new Error('Provider mismatch: expected '+provider+' but received '+result.provider);target.innerHTML=render(result)}catch(error){target.innerHTML='<div class="error"><strong>Generation failed</strong><br>'+esc(error.message)+'</div>'}finally{button.disabled=false}}
  document.querySelectorAll('.generate').forEach(button=>button.onclick=()=>generate(button.dataset.provider,button));
  </script></main></body></html>`;
}

async function openAiBaseline(env, input) {
  if (env.OPENAI_API_KEY) return generateSeo(env, input, { provider: "openai" });
  const endpoint = env.OPENAI_BASELINE_URL;
  if (!endpoint) throw new Error("OpenAI preview access is not configured");
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-seo-preview": "isolated-comparison" },
    body: JSON.stringify({ topic: input.topic })
  });
  const result = await response.json();
  if (!response.ok || !result?.data) throw new Error(result?.error || `OpenAI baseline failed with ${response.status}`);
  if (result.provider !== "openai") throw new Error(`OpenAI baseline used ${result.provider || "an unknown provider"}`);
  return { ...result, telemetry: { provider: "openai", model: "gpt-4o-production-baseline", attempts: 1, durationMs: Date.now() - startedAt, failures: [] } };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("token") && url.searchParams.get("token") === env.PREVIEW_ACCESS_TOKEN) {
      return new Response(null, { status: 302, headers: { location: url.origin, "set-cookie": `seo_preview=${env.PREVIEW_ACCESS_TOKEN}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`, "cache-control": "no-store" } });
    }
    if (!authorized(request, env)) return new Response("Private preview", { status: 401, headers: { "cache-control": "no-store" } });
    if (url.pathname === "/api/health") return new Response(JSON.stringify({ ok: true, isolated: true, databaseBound: false, models: SEO_MODELS }), { headers });
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const payload = await request.json();
        if (!['openai', 'cloudflare'].includes(payload.provider)) return new Response(JSON.stringify({ error: "Choose openai or cloudflare" }), { status: 400, headers });
        const input = await normalizeSeoInput(payload);
        if (!input.topic.trim()) return new Response(JSON.stringify({ error: "Enter content details" }), { status: 400, headers });
        const result = payload.provider === "openai" ? await openAiBaseline(env, input) : await generateSeo(env, input, { provider: "cloudflare" });
        if (result.provider !== payload.provider) throw new Error(`Provider mismatch: requested ${payload.provider}, received ${result.provider}`);
        return new Response(JSON.stringify(result), { headers });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 502, headers });
      }
    }
    if (url.pathname === "/api/compare" && request.method === "POST") {
      try {
        const input = await normalizeSeoInput(await request.json());
        if (!input.topic.trim()) return new Response(JSON.stringify({ error: "Enter a content description" }), { status: 400, headers });
        const [openai, cloudflare] = await Promise.allSettled([
          openAiBaseline(env, input),
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
