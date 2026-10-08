import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const OWNER_EMAIL = "alexbryant3234@gmail.com";
const REMOVED_OWNER_ALIASES = [
  "alexbryantwork3234@outlook.com",
  "Y98MCpY2VTQujHVwvhufxYE6Azh1",
  "L6GV2I8v1IZ8ZsSJVlof9K559A43",
  "XvLFswTmQ7YalJNYTC3vT7Y9OsB3"
];

test("web billing is enabled and only the requested owner email is configured", async () => {
  const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.equal((config.match(/WEB_BILLING_ENABLED = "true"/g) || []).length, 2);
  assert.equal((config.match(/BILLING_OWNER_USER_IDS = ""/g) || []).length, 2);
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

test("the signed-in owner can generate SEO without waiting on billing lookup", async () => {
  const pages = ["create-post.html", "uploadimages.html", "settings.html"];
  for (const page of pages) {
    const source = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(source, /normalizeUserKey\((?:auth\.currentUser|user)\?\.email\) === "alexbryant3234@gmail\.com"/);
  }
});
