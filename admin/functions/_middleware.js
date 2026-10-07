import { authorized } from '../security.mjs';
export async function onRequest(context) {
  if (!await authorized(context.request, context.env)) return new Response('Admin access denied', {status:403,headers:{'Cache-Control':'no-store'}});
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(response.body,{status:response.status,headers});
}
