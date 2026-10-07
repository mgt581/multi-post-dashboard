const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export async function authorized(request, env) {
  try {
    const team = env.ACCESS_TEAM_DOMAIN;
    const audience = env.ACCESS_AUD;
    const allowed = String(env.ADMIN_EMAILS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team || '') || !audience || !allowed.length) return false;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > 16000) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now()/1000;
    if(header.alg !== 'RS256' || claims.iss !== `https://${team}` || !Array.isArray(claims.aud) || !claims.aud.includes(audience) || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now+60 || (claims.nbf != null && claims.nbf > now+60) || !allowed.includes(String(claims.email || '').toLowerCase())) return false;
    const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if(!response.ok) return false;
    const {keys} = await response.json();
    const jwk = keys.find(k=>k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}
