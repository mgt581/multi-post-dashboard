import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Workspaces can be saved under an email or a Firebase UID. Upload routes check
// ownership against that exact ID, so every upload page must switch to the
// verified owner the server names in X-Workspace-Owner after loading accounts.
for (const page of ['create-post.html', 'uploadimages.html', 'folder.html']) {
  test(`${page} adopts the verified workspace owner before uploading`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.match(html, /X-Workspace-Owner/);
  });
}

test('create-post switches userScope to the X-Workspace-Owner header', () => {
  const html = readFileSync(new URL('../create-post.html', import.meta.url), 'utf8');
  const fn = html.match(/function adoptWorkspaceOwner\(response\) \{[\s\S]*?\n  \}/)[0];
  const run = new Function('userScope', 'response', `${fn}; adoptWorkspaceOwner(response); return userScope;`);
  const headers = owner => ({ headers: { get: name => (name === 'X-Workspace-Owner' ? owner : null) } });
  assert.equal(run('owner@example.com', headers('FirebaseUid123')), 'FirebaseUid123');
  assert.equal(run('owner@example.com', headers(null)), 'owner@example.com');
  assert.equal(run('owner@example.com', headers('  ')), 'owner@example.com');
});
