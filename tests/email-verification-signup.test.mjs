import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../signin.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/import\s+\{[\s\S]*?\}\s+from\s+"[^"]+";/g, '');

test('signup sends email verification before redirecting, even when auth fires immediately', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', classList: { toggle() {} }, style: {},
      addEventListener(type, callback) { this[type] = callback; },
      removeAttribute() {}
    });
    return elements.get(id);
  };
  const events = [];
  let authListener;
  let resolveEmail;
  const user = { email: 'tester@example.com', uid: 'uid-1', emailVerified: false };
  const auth = { currentUser: null };
  const context = vm.createContext({
    document: { getElementById: get },
    window: { location: { replace() { events.push('redirect'); } } },
    localStorage: { getItem() { return null; }, removeItem() {}, setItem() {} },
    location: { search: '' }, navigator: { userAgent: '' }, URLSearchParams,
    initializeApp: () => ({}), getAuth: () => auth,
    onAuthStateChanged(_, callback) { authListener = callback; },
    setPersistence: async () => {}, browserLocalPersistence: {},
    createUserWithEmailAndPassword: async () => {
      auth.currentUser = user;
      authListener(user);
      return { user };
    },
    signInWithEmailAndPassword: async () => { throw new Error('Unexpected sign in'); },
    GoogleAuthProvider: class { setCustomParameters() {} },
    signInWithPopup: async () => { throw new Error('Unexpected Google sign in'); },
    sendEmailVerification: () => { events.push('send'); return new Promise(resolve => { resolveEmail = resolve; }); },
    sendPasswordResetEmail: async () => {}
  });
  vm.runInContext(script, context);
  get('signupTab').click();
  get('email').value = user.email;
  get('password').value = 'password123';
  const submit = get('authForm').submit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['send']);
  resolveEmail();
  await submit;
  assert.deepEqual(events, ['send', 'redirect']);
});
