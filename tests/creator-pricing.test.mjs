import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Creator plan presents the new prices and included limits", async () => {
  const pricing = await readFile(new URL("../pricing.html", import.meta.url), "utf8");
  assert.match(pricing, /Creator Monthly £7\.99/);
  assert.match(pricing, /Creator Yearly £79/);
  assert.equal((pricing.match(/1 YouTube, 1 TikTok and 1 Facebook account · Up to 6 posts daily/g) || []).length, 2);
});

test("Pro presents lower prices while preserving its existing limits and subscribers", async () => {
  const [pricing, worker, config] = await Promise.all([
    readFile(new URL("../pricing.html", import.meta.url), "utf8"),
    readFile(new URL("../worker.js", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8")
  ]);
  assert.match(pricing, /Pro Monthly £14\.99/);
  assert.match(pricing, /Pro Yearly £149/);
  assert.equal((pricing.match(/3 YouTube, 3 TikTok and 3 Facebook accounts · Up to 27 posts daily/g) || []).length, 2);
  assert.doesNotMatch(pricing, /Pro Plus Monthly £49|Pro Plus Yearly £529\.99/);
  assert.match(worker, /key: "pro_plus",\s+label: "Pro"/);
  assert.match(worker, /\["pro", "pro_plus"\]\.includes\(requestedPlan\)/);
  assert.equal((config.match(/STRIPE_PRICE_PRO_PLUS_MONTHLY = "price_1UP25bPpTMFHe2pei04QVcwj"/g) || []).length, 2);
  assert.equal((config.match(/STRIPE_PRICE_PRO_PLUS_YEARLY = "price_1UP25oPpTMFHe2peQVLOAiXP"/g) || []).length, 2);
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
  assert.equal((config.match(/STRIPE_PRICE_PRO_MONTHLY = "price_1UOgWFPpTMFHe2pexZosSHKx"/g) || []).length, 2);
  assert.equal((config.match(/STRIPE_PRICE_PRO_YEARLY = "price_1UOgWUPpTMFHe2pe51LbDRt2"/g) || []).length, 2);
  assert.equal((config.match(/STRIPE_LEGACY_PRICE_PRO_MONTHLY/g) || []).length, 2);
  assert.equal((config.match(/STRIPE_LEGACY_PRICE_PRO_YEARLY/g) || []).length, 2);
});
