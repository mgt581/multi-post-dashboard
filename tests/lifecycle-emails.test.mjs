import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';
import { recordLifecycleUser, recordSourceVisit, sendLifecycleEmails, lifecycleEmail, firstNameOf } from '../lifecycle-emails.mjs';

const DAY = 86400;
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/0009_play_subscriptions.sql', 'migrations/0012_publication_reservations.sql', 'migrations/0020_lifecycle_emails.sql', 'migrations/0021_lifecycle_winback.sql', 'migrations/0022_signup_source.sql']) {
    sqlite.exec(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  }
  const db = { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async run() { return sqlite.prepare(sql).run(...args); },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; }
  }; } };
  return { sqlite, db };
}
const mailer = () => { const sent = []; return { sent, fetchImpl: async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); } }; };

test('welcome goes once to new verified sign-ups; old, unverified, owner and paid accounts get nothing', async () => {
  const { sqlite, db } = fixture();
  const now = 2_000_000_000;
  const add = (id, email, daysAgo, verified = true) => recordLifecycleUser(db, { userId: id, email, emailVerified: verified, createdAt: (now - daysAgo * DAY) * 1000, displayName: 'Sam Smith' });
  await add('new', 'new@example.com', 0.1);
  await add('old', 'old@example.com', 30);
  await add('unverified', 'u@example.com', 0.1, false);
  await add('owner', 'boss@example.com', 0.1);
  await add('paid', 'paid@example.com', 0.1);
  sqlite.prepare("INSERT INTO billing_subscriptions (user_id,user_email,subscription_status) VALUES ('paid','paid@example.com','trialing')").run();
  const env = { DB: db, RESEND_API_KEY: 'test', BILLING_OWNER_EMAILS: 'boss@example.com' };
  const m = mailer();
  assert.equal((await sendLifecycleEmails(env, { now, fetchImpl: m.fetchImpl, gapMs: 0 })).sent, 1);
  assert.deepEqual(m.sent.map(e => e.to[0]), ['new@example.com']);
  assert.match(m.sent[0].subject, /3 free posts/);
  assert.match(m.sent[0].text, /^Hi Sam,/);
  assert.match(m.sent[0].text, /api\/unsubscribe\?u=new&t=/);
  assert.equal((await sendLifecycleEmails(env, { now: now + 300, fetchImpl: m.fetchImpl, gapMs: 0 })).sent, 0, 'never twice');
});

test('day-2 nudge only if they have not posted; free-posts-used email once a platform hits 3', async () => {
  const { sqlite, db } = fixture();
  const now = 2_000_000_000;
  for (const id of ['idle', 'poster']) await recordLifecycleUser(db, { userId: id, email: `${id}@example.com`, emailVerified: true, createdAt: (now - 2.5 * DAY) * 1000 });
  sqlite.prepare('UPDATE lifecycle_emails SET welcome_sent_at = ?').run(now - 2 * DAY);
  sqlite.prepare("INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status) VALUES ('p1','poster','youtube',0,'completed')").run();
  const env = { DB: db, RESEND_API_KEY: 'test' };
  const m = mailer();
  await sendLifecycleEmails(env, { now, fetchImpl: m.fetchImpl, gapMs: 0 });
  assert.deepEqual(m.sent.map(e => [e.to[0], e.subject]), [['idle@example.com', 'Your first post takes 2 minutes']]);
  for (const n of [2, 3]) sqlite.prepare(`INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status) VALUES ('p${n}','poster','youtube',0,'completed')`).run();
  await sendLifecycleEmails(env, { now: now + 300, fetchImpl: m.fetchImpl, gapMs: 0 });
  assert.equal(m.sent.at(-1).to[0], 'poster@example.com');
  assert.match(m.sent.at(-1).subject, /used your free posts/);
  assert.equal(m.sent.length, 2);
});

test('a failed send is retried later, unsubscribe stops everything, and nothing sends without a key', async () => {
  const { sqlite, db } = fixture();
  const now = 2_000_000_000;
  await recordLifecycleUser(db, { userId: 'a', email: 'a@example.com', emailVerified: true, createdAt: now * 1000 });
  assert.equal((await sendLifecycleEmails({ DB: db }, { now, gapMs: 0 })).sent, 0, 'no RESEND_API_KEY, no email');
  const failing = { sent: 0, fetchImpl: async () => new Response('{}', { status: 429 }) };
  assert.equal((await sendLifecycleEmails({ DB: db, RESEND_API_KEY: 'k' }, { now, fetchImpl: failing.fetchImpl, gapMs: 0 })).sent, 0);
  assert.equal(sqlite.prepare("SELECT welcome_sent_at FROM lifecycle_emails WHERE user_id='a'").get().welcome_sent_at, null, 'released for a retry');
  const token = sqlite.prepare("SELECT unsubscribe_token t FROM lifecycle_emails WHERE user_id='a'").get().t;
  const res = await worker.fetch(new Request(`https://test.invalid/api/unsubscribe?u=a&t=${token}`), { DB: db });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /unsubscribed/);
  const bad = await worker.fetch(new Request('https://test.invalid/api/unsubscribe?u=a&t=wrong'), { DB: db });
  assert.equal(bad.status, 400);
  const m = mailer();
  assert.equal((await sendLifecycleEmails({ DB: db, RESEND_API_KEY: 'k' }, { now, fetchImpl: m.fetchImpl, gapMs: 0 })).sent, 0);
});

test('first names are only used when they look like a name', () => {
  assert.equal(firstNameOf('Sam Smith'), 'Sam');
  assert.equal(firstNameOf('<script>'), '');
  assert.equal(firstNameOf(''), '');
  assert.match(lifecycleEmail('welcome', { user_id: 'x', unsubscribe_token: 't', first_name: '' }).text, /^Hi there,/);
});

test('win-back goes once to marked rows that have not posted, and never adds a welcome or nudge', async () => {
  const { sqlite, db } = fixture();
  const now = 2_000_000_000;
  const ins = sqlite.prepare("INSERT INTO lifecycle_emails (user_id,email,first_name,signed_up_at,unsubscribe_token,welcome_sent_at,nudge_sent_at,winback_due) VALUES (?,?,'',?,'tok',1,1,?)");
  ins.run('stuck', 'stuck@example.com', now - 2.5 * DAY, 1);
  ins.run('posted', 'posted@example.com', now - 2.5 * DAY, 1);
  ins.run('unmarked', 'unmarked@example.com', now - 2.5 * DAY, null);
  sqlite.prepare("INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status) VALUES ('w1','posted','youtube',0,'completed')").run();
  const env = { DB: db, RESEND_API_KEY: 'test' };
  const m = mailer();
  await sendLifecycleEmails(env, { now, fetchImpl: m.fetchImpl, gapMs: 0 });
  await sendLifecycleEmails(env, { now: now + 300, fetchImpl: m.fetchImpl, gapMs: 0 });
  assert.deepEqual(m.sent.map(e => [e.to[0], e.subject]), [['stuck@example.com', 'MultiPost is now free to try, no card needed']]);
  assert.match(m.sent[0].text, /^Hi there,/);
  assert.match(m.sent[0].text, /api\/unsubscribe\?u=stuck&t=tok/);
});

test('Google sign-ups with no top-level email are recorded by their Google address', async () => {
  const { sqlite, db } = fixture();
  await recordLifecycleUser(db, { userId: 'g', email: '', emailVerified: false, contactEmail: 'g@gmail.com', contactName: 'Jo Bloggs', createdAt: Date.now() });
  await recordLifecycleUser(db, { userId: 'none', email: '', emailVerified: false, contactEmail: '', createdAt: Date.now() });
  const rows = sqlite.prepare('SELECT user_id, email, first_name FROM lifecycle_emails ORDER BY user_id').all();
  assert.deepEqual(rows.map(r => [r.user_id, r.email, r.first_name]), [['g', 'g@gmail.com', 'Jo']]);
});

test('new sign-ups are tagged with their source once; old accounts and junk values are not', async () => {
  const { sqlite, db } = fixture();
  const base = { emailVerified: true, createdAt: Date.now() };
  await recordLifecycleUser(db, { ...base, userId: 'card', email: 'c@example.com', source: 'Card' });
  await recordLifecycleUser(db, { ...base, userId: 'card', email: 'c@example.com', source: 'facebook' });
  await recordLifecycleUser(db, { ...base, userId: 'old', email: 'o@example.com', createdAt: Date.now() - 5 * DAY * 1000, source: 'card' });
  await recordLifecycleUser(db, { ...base, userId: 'junk', email: 'j@example.com', source: '<script>' });
  await recordLifecycleUser(db, { ...base, userId: 'none', email: 'n@example.com' });
  const rows = Object.fromEntries(sqlite.prepare('SELECT user_id, signup_source s FROM lifecycle_emails').all().map(r => [r.user_id, r.s]));
  assert.deepEqual(rows, { card: 'card', old: null, junk: null, none: null });
});

test('QR visits are counted per source per day through /api/visit', async () => {
  const { sqlite, db } = fixture();
  for (let i = 0; i < 3; i++) {
    const res = await worker.fetch(new Request('https://test.invalid/api/visit?src=card', { method: 'POST' }), { DB: db });
    assert.equal(res.status, 204);
  }
  await worker.fetch(new Request('https://test.invalid/api/visit?src=bad%20value', { method: 'POST' }), { DB: db });
  assert.equal(await recordSourceVisit(db, 'card', Date.parse('2026-01-02T10:00:00Z')), true);
  const rows = sqlite.prepare('SELECT source, visits FROM source_visits ORDER BY day').all().map(r => [r.source, r.visits]);
  assert.deepEqual(rows, [['card', 1], ['card', 3]]);
});

test('the landing page saves ?src and the app sends it with billing status', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(index, /signup-source\.js/);
  assert.match(app, /signup-source\.js/);
  assert.match(app, /&src=\$\{encodeURIComponent\(signupSource\)\}/);
});
