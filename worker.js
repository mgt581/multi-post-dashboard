// Cloudflare Worker entrypoint for Multipost
// - Implements a fetch() handler (Cloudflare Workers runtime)
// - Responds 200 on /api/health (and other defined endpoints)
// - Avoids Express (not supported in standard Workers without extra adapters)

/**
 * CORS headers for browser clients.
 * Note: Adjust FRONTEND_URL allowlist as needed.
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    env?.FRONTEND_URL,
    env?.BASE_URL,
    // Common variants
    'https://multipostapp.co.uk',
    'https://www.multipostapp.co.uk'
  ].filter(Boolean));

  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  if (allowed.size === 0) {
    // If no allowlist configured, reflect origin (best-effort)
    if (origin) h['Access-Control-Allow-Origin'] = origin;
  } else if (origin && allowed.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }

  // Needed when reflecting Origin or using cookies/Authorization
  if (h['Access-Control-Allow-Origin']) {
    h['Vary'] = 'Origin';
    h['Access-Control-Allow-Credentials'] = 'true';
  }

  return h;
}

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}

function text(body, { status = 200, headers = {} } = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers
    }
  });
}

async function readJson(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().includes('application/json')) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function withCors(response, request, env) {
  const h = corsHeaders(request, env);
  const out = new Response(response.body, response);
  Object.entries(h).forEach(([k, v]) => out.headers.set(k, v));
  return out;
}

function routeNotFound(request, env) {
  return withCors(json({ success: false, error: 'Not found' }, { status: 404 }), request, env);
}

// --- Minimal D1 helpers (folders CRUD) ---
async function ensureFoldersTable(env) {
  // In production you should rely on migrations; this is a safe guard for fresh DBs.
  // If the table already exists, D1 will error; we ignore that.
  try {
    await env.DB.exec(
      'CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')));'
    );
  } catch {
    // ignore
  }
}

async function handleGetFolders(request, env) {
  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id') || '';
  if (!user_id) return json({ success: false, error: 'Missing user_id' }, { status: 400 });

  await ensureFoldersTable(env);
  const { results } = await env.DB
    .prepare('SELECT id, name, user_id FROM folders WHERE user_id = ? ORDER BY id DESC')
    .bind(user_id)
    .all();

  // Existing frontend expects an array, not {success:true,...}
  return json(results || []);
}

async function handleAddFolder(request, env) {
  const body = await readJson(request);
  const name = (body?.name || '').trim();
  const user_id = (body?.user_id || '').trim();
  if (!name || !user_id) return json({ success: false, error: 'Missing name or user_id' }, { status: 400 });

  await ensureFoldersTable(env);
  const res = await env.DB
    .prepare('INSERT INTO folders (name, user_id) VALUES (?, ?)')
    .bind(name, user_id)
    .run();

  return json({ success: true, id: res?.meta?.last_row_id ?? null });
}

async function handleRenameFolder(request, env) {
  const body = await readJson(request);
  const id = body?.id;
  const name = (body?.name || '').trim();
  const user_id = (body?.user_id || '').trim();
  if (!id || !name || !user_id) return json({ success: false, error: 'Missing id, name, or user_id' }, { status: 400 });

  await ensureFoldersTable(env);
  await env.DB
    .prepare('UPDATE folders SET name = ? WHERE id = ? AND user_id = ?')
    .bind(name, id, user_id)
    .run();

  return json({ success: true });
}

async function handleDeleteFolder(request, env) {
  const body = await readJson(request);
  const id = body?.id;
  const user_id = (body?.user_id || '').trim();
  if (!id || !user_id) return json({ success: false, error: 'Missing id or user_id' }, { status: 400 });

  await ensureFoldersTable(env);
  await env.DB
    .prepare('DELETE FROM folders WHERE id = ? AND user_id = ?')
    .bind(id, user_id)
    .run();

  return json({ success: true });
}

// --- AI SEO endpoint placeholder (keeps frontend from hard-failing) ---
async function handleGenerateSeo(request, env) {
  const body = await readJson(request);
  const prompt = (body?.prompt || '').trim();
  if (!prompt) return json({ success: false, error: 'Missing prompt' }, { status: 400 });

  // If AI binding isn't configured, return fallbackUsed so UI can fall back.
  if (!env.AI) {
    return json({ success: false, fallbackUsed: true, error: 'AI not configured' }, { status: 200 });
  }

  // NOTE: The repo references @cf/meta/llama-3.1-vision-8b in TODO.
  // This implementation is intentionally conservative; adjust model/prompting as you like.
  try {
    const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You generate SEO titles, descriptions, and hashtags for social posts.' },
        { role: 'user', content: prompt }
      ]
    });

    return json({
      success: true,
      fallbackUsed: false,
      data: {
        facebook: { descriptionAndTags: String(aiResult?.response || aiResult?.result || '') },
        instagram: { descriptionAndTags: String(aiResult?.response || aiResult?.result || '') },
        youtube: { title: prompt.slice(0, 70), description: String(aiResult?.response || aiResult?.result || ''), keywords: '' },
        tiktok: { allInOne: String(aiResult?.response || aiResult?.result || '') }
      }
    });
  } catch (e) {
    return json({ success: false, fallbackUsed: true, error: e?.message || 'AI error' }, { status: 200 });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return withCors(text('', { status: 204 }), request, env);
    }

    // Health check (ensure 200 instead of 302)
    if (url.pathname === '/api' || url.pathname === '/api/' || url.pathname === '/api/health') {
      return withCors(json({ ok: true, service: 'multipost-worker' }), request, env);
    }

    // Folder CRUD (used by app.html)
    if (url.pathname === '/api/get-folders' && request.method === 'GET') {
      return withCors(await handleGetFolders(request, env), request, env);
    }
    if (url.pathname === '/api/add-folder' && request.method === 'POST') {
      return withCors(await handleAddFolder(request, env), request, env);
    }
    if (url.pathname === '/api/rename-folder' && request.method === 'POST') {
      return withCors(await handleRenameFolder(request, env);
    }
    if (url.pathname === '/api/delete-folder' && request.method === 'POST') {
      return withCors(await handleDeleteFolder(request, env), request, env);
    }

    // AI SEO
    if (url.pathname === '/api/generate-seo' && request.method === 'POST') {
      return withCors(await handleGenerateSeo(request, env), request, env);
    }

    return routeNotFound(request, env);
  }
};