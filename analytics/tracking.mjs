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
  if (ctx?.waitUntil) ctx.waitUntil(promise);
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
export async function observe(request, response, env) {
  if (env.ANALYTICS_ENABLED !== 'true' || !env.DB) return;
  const url = new URL(request.url);
  const path = url.pathname;
  // Read only identities already carried in safe query/header fields. No body clone.
  const user = request.headers.get('user_id') || url.searchParams.get('user_id');
  if (!user || !/^[A-Za-z0-9@._+-]{1,200}$/.test(user)) return;
  const known = await env.DB.prepare(`SELECT user_id FROM folders WHERE user_id=? UNION SELECT user_id FROM accounts WHERE user_id=? UNION SELECT user_id FROM billing_subscriptions WHERE user_id=? LIMIT 1`).bind(user,user,user).first();
  if (!known) return;
  let type = 'backend_activity';
  let platform = null;
  const match = path.match(/^\/api\/(youtube|facebook|tiktok)\/(init-upload|upload|upload-image|finish-upload|upload-chunk|publish-status)$/);
  if (match) { type = 'publishing_request'; platform = match[1]; }
  else if (!['/api/billing/status','/api/get-accounts','/api/get-folders'].includes(path)) return;
  await env.DB.prepare(`INSERT INTO analytics_activity (id,user_id,event_type,platform,created_at,http_success,status_class)
    VALUES (?,?,?,?,strftime('%s','now'),?,?)`).bind(crypto.randomUUID(),user,type,platform,response.ok ? 1 : 0,`${Math.floor(response.status/100)}xx`).run();
}
