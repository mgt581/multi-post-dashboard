const $ = id=>document.getElementById(id);
const text = value=>value==null?'Unknown':String(value);
const date = value=>value ? new Date(value*1000).toLocaleString() : 'Unknown';
const money = value=>value==null?'Unknown':`$${Number(value).toFixed(6)}`;
function table(target,rows,columns) {
  const t=document.createElement('table'),h=document.createElement('tr');
  for(const [,label] of columns){const cell=document.createElement('th');cell.textContent=label;h.append(cell);}t.append(h);
  for(const row of rows){const tr=document.createElement('tr');for(const [key,,format] of columns){const td=document.createElement('td');if(key==='user_id'&&row[key]){const a=document.createElement('a');a.href=`/?user=${encodeURIComponent(row[key])}`;a.textContent=row[key];td.append(a);}else td.textContent=format?format(row[key]):text(row[key]);tr.append(td);}t.append(tr);}
  $(target).replaceChildren(t);if(!rows.length){const p=document.createElement('p');p.textContent='No records in this reporting window.';$(target).append(p);}
}
function bar(target,label,value){const div=document.createElement('div');div.className='bar';const a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;div.append(a,b);$(target).append(div);}
let data;
function users(){table('user-data',data.users.filter(x=>x.user_id.includes($('search').value)),[['user_id','Internal user'],['first_folder_at','First folder',date],['last_activity','Last backend activity',date],['plan_key','Plan'],['subscription_status','Subscription'],['trial_end','Trial end',date],['facebook','Facebook',v=>v?'Linked':'No link'],['youtube','YouTube',v=>v?'Linked':'No link'],['tiktok','TikTok',v=>v?'Linked':'No link'],['seo_generations','SEO'],['estimated_cost_usd','Est. API cost',money]]);}
async function load(){
  const query=new URLSearchParams(location.search);query.set('days',$('days').value);
  try{const r=await fetch(`/api/analytics?${query}`);if(!r.ok)throw new Error('Analytics unavailable. Check Access settings, D1 binding and migration.');data=await r.json();
    $('status').textContent=`Last refreshed ${new Date().toLocaleTimeString()} · Up to 1,000 users / 1,000 recent events shown · ${data.days} days`;
    const total=data.summary.reduce((s,r)=>s+r.generations,0),cost=data.summary.reduce((s,r)=>s+Number(r.estimated_cost_usd||0),0),all=data.users.filter(x=>x.facebook&&x.youtube&&x.tiktok).length;
    $('cards').replaceChildren();for(const [label,value] of [['Observed users',data.users.length],['SEO generations',total],['Est. OpenAI API cost',data.summary.some(r=>r.estimated_cost_usd!=null)?money(cost):'Unknown'],['All three linked',all]]){const d=document.createElement('div');d.className='card';const a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;d.append(a,b);$('cards').append(d);}
    table('provider-data',data.summary,[['provider','Provider'],['generations','Generations'],['input_tokens','Input tokens'],['output_tokens','Output tokens'],['total_tokens','Total tokens'],['estimated_cost_usd','Est. USD',money],['unpriced_requests','Unpriced']]);
    $('connections').replaceChildren();for(const p of ['facebook','youtube','tiktok'])bar('connections',p,data.users.filter(u=>u[p]).length);
    users();table('seo-data',data.seo,[['created_at','Time',date],['user_id','User'],['provider','Used'],['attempted','Attempts'],['mode','Input mode'],['model','Model'],['openai_success','OpenAI',v=>v==null?'Not attempted':v?'Success':'Failed'],['openai_error','OpenAI error'],['cloudflare_success','Cloudflare',v=>v==null?'Not attempted':v?'Success':'Failed'],['cloudflare_error','CF error'],['local_used','Local',v=>v?'Yes':'No'],['duration_ms','ms'],['success','Outcome',v=>v?'Success':'Failed'],['input_tokens','Input'],['output_tokens','Output'],['total_tokens','Total'],['estimated_cost_usd','Est. USD',money],['attribution','Attribution']]);
    table('event-data',data.activity,[['created_at','Time',date],['user_id','User'],['event_type','Event'],['platform','Platform'],['http_success','HTTP result',v=>v?'Success':'Failed'],['status_class','Status']]);
    $('health-data').replaceChildren();for(const [key,value] of Object.entries(data.health)){const p=document.createElement('p');p.className='healthline';p.textContent=`${key}: ${value}`;$('health-data').append(p);}for(const row of data.seo.filter(x=>x.openai_error||x.cloudflare_error).slice(0,10))bar('health-data',date(row.created_at),row.openai_error||row.cloudflare_error);
    if(query.get('user')){$('detail').hidden=false;$('detail').textContent=`User activity: ${query.get('user')} · Signup: unknown · Source: not collected · Recorded publishing usage: ${data.publish.reduce((s,r)=>s+r.recorded_usage,0)}`;}
    for(const a of document.querySelectorAll('.export')){const u=new URL(a.href);u.searchParams.set('days',$('days').value);if(query.get('user'))u.searchParams.set('user',query.get('user'));a.href=u;}
  }catch(e){$('status').textContent=e.message;}
}
$('days').addEventListener('change',load);$('search').addEventListener('input',users);load();
