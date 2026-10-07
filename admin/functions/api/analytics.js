import { csv } from '../../report.mjs';
export async function onRequestGet({request,env}) {
  const url = new URL(request.url);
  const user = url.searchParams.get('user');
  const days = Math.min(90,Math.max(1,Number(url.searchParams.get('days')) || 30));
  const since = Math.floor(Date.now()/1000)-days*86400;
  const run = async (sql,values=[]) => (await env.DB.prepare(sql).bind(...values).all()).results || [];
  try {
    const users = await run(`WITH ids AS (SELECT user_id FROM folders UNION SELECT user_id FROM accounts UNION SELECT user_id FROM billing_subscriptions UNION SELECT user_id FROM analytics_activity UNION SELECT user_id FROM analytics_seo_events WHERE user_id IS NOT NULL)
      SELECT ids.user_id,b.plan_key,b.subscription_status,b.trial_end,b.is_owner,
      (SELECT MIN(created_at) FROM folders f WHERE f.user_id=ids.user_id) first_folder_at,
      (SELECT MAX(created_at) FROM (SELECT created_at FROM analytics_activity e WHERE e.user_id=ids.user_id UNION ALL SELECT created_at FROM analytics_seo_events s WHERE s.user_id=ids.user_id)) last_activity,
      EXISTS(SELECT 1 FROM accounts a WHERE a.user_id=ids.user_id AND a.platform IN ('facebook','facebook_page')) facebook,
      EXISTS(SELECT 1 FROM accounts a WHERE a.user_id=ids.user_id AND a.platform='youtube') youtube,
      EXISTS(SELECT 1 FROM accounts a WHERE a.user_id=ids.user_id AND a.platform='tiktok') tiktok,
      (SELECT COUNT(*) FROM analytics_seo_events s WHERE s.user_id=ids.user_id AND s.created_at>=?) seo_generations,
      (SELECT SUM(estimated_cost_usd) FROM analytics_seo_events s WHERE s.user_id=ids.user_id AND s.created_at>=?) estimated_cost_usd
      FROM ids LEFT JOIN billing_subscriptions b ON b.user_id=ids.user_id WHERE ids.user_id IS NOT NULL ORDER BY last_activity DESC LIMIT 1000`,[since,since]);
    const where = user ? ' AND user_id=?' : '';
    const params = user ? [since,user] : [since];
    const seo = await run(`SELECT id,user_id,attribution,created_at,provider,attempted,openai_success,openai_error,cloudflare_success,cloudflare_error,local_used,duration_ms,mode,model,success,input_tokens,output_tokens,total_tokens,estimated_cost_usd FROM analytics_seo_events WHERE created_at>=?${where} ORDER BY created_at DESC LIMIT 1000`,params);
    const activity = await run(`SELECT id,user_id,event_type,platform,created_at,http_success,status_class FROM analytics_activity WHERE created_at>=?${where} ORDER BY created_at DESC LIMIT 1000`,params);
    const publish = await run(`SELECT user_id,platform,COUNT(*) recorded_usage FROM billing_usage_events WHERE event_type='publish' AND created_at>=?${where} GROUP BY user_id,platform`,params);
    const summary = await run(`SELECT provider,COUNT(*) generations,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(total_tokens) total_tokens,SUM(estimated_cost_usd) estimated_cost_usd,SUM(CASE WHEN estimated_cost_usd IS NULL AND input_tokens IS NOT NULL THEN 1 ELSE 0 END) unpriced_requests FROM analytics_seo_events WHERE created_at>=?${where} GROUP BY provider`,params);
    const data = {users:user ? users.filter(x=>x.user_id===user):users,seo,activity,publish,summary,days,limits:{users:1000,events:1000},health:{status:'ok',signup:'Not observable: Firebase sign-in is client-side',source:'Not collected',attribution:'Folder ownership / client-supplied IDs; unverified',publishing:'HTTP results and existing usage events; not proof of publication'}};
    const kind = url.searchParams.get('export');
    if(kind && ['users','seo','activity','publish','summary'].includes(kind)) return new Response(csv(data[kind]),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="multipost-${kind}.csv"`}});
    return Response.json(data);
  } catch {return Response.json({health:{status:'unavailable',category:'database_unavailable_or_schema_missing'}},{status:503});}
}
