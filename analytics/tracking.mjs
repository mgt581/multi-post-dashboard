// Allowlisted telemetry only. Never accepts prompts, responses, URLs or error bodies.
export function safeCategory(error, status) {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'provider_unavailable';
  if (status >= 400) return 'invalid_request';
  if (error instanceof SyntaxError) return 'invalid_output';
  if (error?.name === 'AbortError') return 'timeout';
  return 'provider_error';
}
export function usageValues(usage, pricing) {
  const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const input = number(usage?.prompt_tokens ?? usage?.input_tokens);
  const output = number(usage?.completion_tokens ?? usage?.output_tokens);
  const total = number(usage?.total_tokens);
  let cost = null;
  if (input !== null && output !== null && pricing) {
    try {
      const p = JSON.parse(pricing)['gpt-4o'];
      if (Number.isFinite(p?.input_per_million) && p.input_per_million >= 0 && Number.isFinite(p?.output_per_million) && p.output_per_million >= 0)
        cost = (input * p.input_per_million + output * p.output_per_million) / 1e6;
    } catch {}
  }
  return { input, output, total, cost };
}
export function schedule(ctx, task) {
  const promise = Promise.resolve().then(task).catch(() => {});
  try { if (ctx?.waitUntil) ctx.waitUntil(promise); } catch {}
}
export async function storeSeo(env, event) {
  if (env.ANALYTICS_ENABLED !== 'true' || !env.DB) return;
  // SEO callers already send folder_id. This attribution is an existing folder owner,
  // not a verified authentication claim. Missing owners remain explicitly anonymous.
  let user = null;
  if (event.folderId != null) {
    try { user = (await env.DB.prepare('SELECT user_id FROM folders WHERE id = ?').bind(event.folderId).first())?.user_id || null; } catch {}
  }
  const u = usageValues(event.usage, env.ANALYTICS_MODEL_PRICING);
  await env.DB.prepare(`INSERT INTO analytics_seo_events
    (id,user_id,attribution,created_at,provider,attempted,openai_success,openai_error,cloudflare_success,cloudflare_error,local_used,duration_ms,mode,model,success,input_tokens,output_tokens,total_tokens,estimated_cost_usd)
    VALUES (?,?,?,strftime('%s','now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(),user,user ? 'folder_owner_unverified' : 'unattributed',event.provider || null,JSON.stringify(event.attempted),event.openaiSuccess ?? null,event.openaiError || null,event.cloudflareSuccess ?? null,event.cloudflareError || null,event.provider === 'local' ? 1 : 0,Math.max(0,event.duration ?? Date.now()-event.started),event.image ? 'image-assisted' : 'text-only',event.model || null,event.success ? 1 : 0,u.input,u.output,u.total,u.cost).run();
}
// Only bounded JSON is inspected in memory; raw fields are never persisted or logged.
async function boundedJson(response) {
  try {
    if (!response?.body) return null;
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}
export function publishingOutcome(platform, stage, data, httpOk) {
  const success = data?.success === false ? 0 : data?.success === true ? 1 : httpOk ? null : 0;
  let state = 'unknown';
  if (success === 0) state = 'request_failed';
  else if (data?.failed === true || ['FAILED','PUBLISH_FAILED'].includes(data?.status)) state = 'failed';
  else if (platform === 'tiktok' && stage === 'publish-status') {
    if (data?.status === 'PUBLISH_COMPLETE') state = 'complete';
    else if (data?.status === 'SEND_TO_USER_INBOX') state = 'inbox_delivery';
    else state = 'processing';
  } else if (platform === 'facebook' && stage === 'video-status') state = data?.ready === true ? 'complete' : 'processing';
  else if (data?.processing === true) state = 'processing';
  else if (stage === 'init-upload') state = 'initiated';
  else if (stage === 'upload-chunk') state = data?.complete === true ? 'upload_complete' : 'uploading';
  else if (success === 1) state = 'accepted';
  return {success,state};
}
export function observationCopies(request, response, enabled) {
  let req = null, res = null;
  if (!enabled) return {req,res};
  const path = new URL(request.url).pathname;
  if (/^\/api\/(youtube|facebook|tiktok)\/(init-upload|upload|upload-image|finish-upload|upload-chunk|publish-status|video-status)$/.test(path) || path === '/api/post-video') {
    try { res = response.clone(); } catch {}
  }
  return {req,res};
}
export function requestCopy(request, enabled) {
  if (enabled && new URL(request.url).pathname === '/api/post-video' && request.headers.get('content-type')?.includes('application/json')) {
    try { return request.clone(); } catch {}
  }
  return null;
}
export async function observe(request, response, env, copies = {}) {
  if (env.ANALYTICS_ENABLED !== 'true' || !env.DB || request.method === 'OPTIONS') return;
  const url = new URL(request.url);
  const path = url.pathname;
  let user = request.headers.get('user_id') || url.searchParams.get('user_id');
  let type = 'backend_activity', platform = null, stage = null;
  const match = path.match(/^\/api\/(youtube|facebook|tiktok)\/(init-upload|upload|upload-image|finish-upload|upload-chunk|publish-status|video-status)$/);
  if (match) { type = 'publishing_request'; platform = match[1]; stage = match[2]; }
  else if (path === '/api/post-video') {
    const data = await boundedJson(copies.req);
    user = typeof data?.user_id === 'string' ? data.user_id : user;
    if (!user && Number.isSafeInteger(Number(data?.account_id))) {
      user = (await env.DB.prepare('SELECT user_id FROM accounts WHERE id=?').bind(Number(data.account_id)).first())?.user_id;
    }
    if (!['youtube','facebook','tiktok'].includes(data?.platform)) return;
    type = 'publishing_request'; platform = data.platform; stage = 'post-video';
  } else if (!['/api/billing/status','/api/get-accounts','/api/get-folders'].includes(path)) return;
  if (!user || !/^[A-Za-z0-9@._+-]{1,200}$/.test(user)) return;
  const known = await env.DB.prepare(`SELECT user_id FROM folders WHERE user_id=? UNION SELECT user_id FROM accounts WHERE user_id=? UNION SELECT user_id FROM billing_subscriptions WHERE user_id=? LIMIT 1`).bind(user,user,user).first();
  if (!known) return;
  const result = type === 'publishing_request' ? publishingOutcome(platform,stage,await boundedJson(copies.res),response.ok) : {success:response.ok ? 1 : 0,state:null};
  await env.DB.prepare(`INSERT INTO analytics_activity (id,user_id,event_type,platform,created_at,http_success,status_class,request_success,stage,publish_state)
    VALUES (?,?,?,?,strftime('%s','now'),?,?,?,?,?)`).bind(crypto.randomUUID(),user,type,platform,response.ok ? 1 : 0,`${Math.floor(response.status/100)}xx`,result.success,stage,result.state).run();
}
