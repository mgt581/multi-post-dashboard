import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pricing = await readFile(new URL("../pricing.html", import.meta.url), "utf8");

test("website pricing keeps Pro plans and the monthly workspace add-on", () => {
  for (const copy of [
    "Pro Monthly",
    "£9.99",
    "Pro Yearly",
    "£79.99",
    "150 AI credits every month",
    "150 successful platform publications every month",
    "£4.99/month on the website"
  ]) assert.match(pricing, new RegExp(copy.replace(/[.*+?^$()|[\]\\]/g, "\\$&")));
  for (const removed of ["25 for £2.99", "100 for £8.99", "250 for £17.99"])
    assert.doesNotMatch(pricing, new RegExp(removed));
});

test("web checkout is gated and uses the authenticated server endpoint", () => {
  assert.match(pricing, /checkoutReady = response\.ok && result\.checkout_enabled === true/);
  assert.match(pricing, /billing\/create-checkout-session/);
  assert.match(pricing, /plan_key: "pro"/);
  assert.doesNotMatch(pricing, /buy\.stripe\.com/);
});
