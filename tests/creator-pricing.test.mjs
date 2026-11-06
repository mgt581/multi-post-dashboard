import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staged Pro paywall presents proposed prices and monthly allowances", async () => {
  const pricing = await readFile(new URL("../pricing.html", import.meta.url), "utf8");
  assert.match(pricing, /<h2>Pro Monthly<\/h2>[\s\S]*?£9\.99/);
  assert.match(pricing, /<h2>Pro Yearly<\/h2>[\s\S]*?£79\.99/);
  assert.match(pricing, /150 AI credits and 150 successful platform publications every month, including on annual billing/);
  assert.match(pricing, /Web payments are being prepared/);
});

test("checkout stays off until new Stripe account and webhook are configured", async () => {
  const [pricing, worker, config] = await Promise.all([
    readFile(new URL("../pricing.html", import.meta.url), "utf8"),
    readFile(new URL("../worker.js", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8")
  ]);
  assert.match(pricing, /billing\/create-checkout-session/);
  assert.equal((config.match(/STRIPE_CHECKOUT_ENABLED = "false"/g) || []).length, 2);
  assert.match(worker, /stripeCheckoutEnabled && Boolean\(stripeCheckoutAccountId && stripeSecretKey && stripeWebhookSecret/);
  assert.match(worker, /entitlement\.access/);
  assert.match(worker, /SELECT 1 AS used FROM billing_play_purchases/);
  assert.match(worker, /key: "pro_plus",\s+label: "Pro"/);
  assert.match(worker, /\["pro", "pro_plus"\]\.includes\(requestedPlan\)/);
  assert.equal((config.match(/STRIPE_PRICE_PRO_PLUS_MONTHLY = "price_1UP25bPpTMFHe2pei04QVcwj"/g) || []).length, 1);
  assert.equal((config.match(/STRIPE_PRICE_PRO_PLUS_YEARLY = "price_1UP25oPpTMFHe2peQVLOAiXP"/g) || []).length, 1);
  assert.match(config.split("[env.preview.vars]")[1], /STRIPE_PRICE_PRO_PLUS_MONTHLY = "price_[^"]+"/);
  assert.equal((config.match(/STRIPE_LEGACY_PRICE_PRO_PLUS_MONTHLY/g) || []).length, 2);
  assert.equal((config.match(/STRIPE_LEGACY_PRICE_PRO_PLUS_YEARLY/g) || []).length, 2);
});

test("Creator retains legacy Pro price mappings and offers the trial monthly or yearly", async () => {
  const [worker, config] = await Promise.all([
    readFile(new URL("../worker.js", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8")
  ]);
  assert.match(worker, /label: "Creator"/);
  assert.match(worker, /\["pro", "pro_plus"\]\.includes\(requestedPlan\) && trialEligible/);
  assert.match(worker, /yearly_only: false/);
  assert.equal((config.match(/STRIPE_PRICE_PRO_MONTHLY = "price_1UOgWFPpTMFHe2pexZosSHKx"/g) || []).length, 1);
  assert.equal((config.match(/STRIPE_PRICE_PRO_YEARLY = "price_1UOgWUPpTMFHe2pe51LbDRt2"/g) || []).length, 1);
  assert.match(config.split("[env.preview.vars]")[1], /STRIPE_PRICE_PRO_MONTHLY = "price_[^"]+"/);
  assert.equal((config.match(/STRIPE_LEGACY_PRICE_PRO_MONTHLY/g) || []).length, 2);
  assert.equal((config.match(/STRIPE_LEGACY_PRICE_PRO_YEARLY/g) || []).length, 2);
});
