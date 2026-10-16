import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const OWNER_EMAIL = "alexbryant3234@gmail.com";
const OWNER_UID = "XvLFswTmQ7YalJNYTC3vT7Y9OsB3";
const REMOVED_OWNER_ALIASES = [
  "alexbryantwork3234@outlook.com",
  "Y98MCpY2VTQujHVwvhufxYE6Azh1",
  "L6GV2I8v1IZ8ZsSJVlof9K559A43"
];

test("web billing recognizes the requested owner email and its Firebase account", async () => {
  const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.equal((config.match(/WEB_BILLING_ENABLED = "true"/g) || []).length, 2);
  assert.equal((config.match(new RegExp(`BILLING_OWNER_USER_IDS = "${OWNER_UID}"`, "g")) || []).length, 2);
  assert.equal((config.match(new RegExp(`BILLING_OWNER_EMAILS = "${OWNER_EMAIL}"`, "g")) || []).length, 2);
  for (const alias of REMOVED_OWNER_ALIASES) assert.doesNotMatch(config, new RegExp(alias));
});

test("browser owner lists contain only the requested account", async () => {
  const pages = ["app.html", "create-post.html", "folder.html", "pricing.html", "settings.html", "uploadimages.html"];
  for (const page of pages) {
    const source = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(OWNER_EMAIL.replace(".", "\\.")));
    for (const alias of REMOVED_OWNER_ALIASES) assert.doesNotMatch(source, new RegExp(alias));
  }
});

test("signin requires an explicit account and landing links use it", async () => {
  const [signin, landing] = await Promise.all([
    readFile(new URL("../signin.html", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8")
  ]);
  assert.match(signin, /signInWithEmailAndPassword/);
  assert.match(signin, /signInWithPopup/);
  assert.doesNotMatch(signin, /workspace-\$\{id\}@users\.multipostapp\.co\.uk/);
  assert.equal((landing.match(/href="signin\.html"/g) || []).length, 2);
});

test("owner bypass requires a verified Firebase identity", async () => {
  const [worker, createPost, uploadImages, settings] = await Promise.all([
    readFile(new URL("../worker.js", import.meta.url), "utf8"),
    readFile(new URL("../create-post.html", import.meta.url), "utf8"),
    readFile(new URL("../uploadimages.html", import.meta.url), "utf8"),
    readFile(new URL("../settings.html", import.meta.url), "utf8")
  ]);
  assert.match(worker, /accounts:lookup/);
  assert.match(worker, /isConfiguredOwner && \(requestedMatchesIdentity \|\| rowMatchesIdentity\)/);
  assert.doesNotMatch(worker, /requestedEmail && ownerEmails\.has\(requestedEmail\)/);
  for (const source of [createPost, uploadImages, settings]) {
    assert.match(source, /auth\.currentUser\?\.getIdToken\(\)/);
    assert.match(source, /headers\.set\("Authorization", `Bearer \$\{token\}`\)/);
  }
});

test("publishing pages use the authenticated server entitlement for owner mode", async () => {
  const pages = ["create-post.html", "uploadimages.html"];
  for (const page of pages) {
    const source = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(source, /authenticatedFetch\([\s\S]{0,80}`\$\{apiBase\}\/billing\/status/);
    assert.match(source, /user_id: userScope/);
    assert.doesNotMatch(source, /normalizeUserKey\(auth\.currentUser\?\.email\) === "alexbryant3234@gmail\.com"/);
  }
  const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
  assert.match(worker, /ensureBillingAccess\(userId, "web", request, true\)/);
  assert.match(worker, /identityMatchesBillingUser/);
});

test("pricing checkout uses the signed-in Firebase identity", async () => {
  const source = await readFile(new URL("../pricing.html", import.meta.url), "utf8");
  assert.match(source, /auth\.currentUser\?\.getIdToken\(\)/);
  assert.match(source, /authenticatedFetch\(`\$\{apiBase\}\/billing\/create-checkout-session/);
  assert.match(source, /success_url: `\$\{window\.location\.origin\}\/app\.html\?billing=success`/);
});

test("profile uses the isolated preview billing service and shared Stripe countdown", async () => {
  const source = await readFile(new URL("../settings.html", import.meta.url), "utf8");
  assert.match(source, /multipost-seo-worker-preview\.alexbryant\.workers\.dev\/api/);
  assert.match(source, /import \{ getBillingDisplay \} from "\.\/billing-ui\.mjs"/);
  assert.match(source, /setInterval\([\s\S]{0,180}60 \* 1000/);
  assert.match(source, /visibilitychange/);
});
