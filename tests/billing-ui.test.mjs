import test from "node:test";
import assert from "node:assert/strict";
import { getBillingDisplay, getWorkspacePurchaseState, renderBillingControls } from "../billing-ui.mjs";

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const unixAfter = (ms) => Math.floor((NOW + ms) / 1000);

test("renders seven and three day Stripe trial countdowns", () => {
  assert.equal(getBillingDisplay({ access: true, status: "trialing", subscription: { trial_end: unixAfter(7 * 86400000) } }, NOW).message, "Trial Active — 7 days remaining");
  assert.equal(getBillingDisplay({ access: true, status: "trialing", subscription: { trial_end: unixAfter(3 * 86400000) } }, NOW).message, "Trial Active — 3 days remaining");
});

test("renders trial ending today and expired states", () => {
  assert.equal(getBillingDisplay({ access: true, status: "trialing", subscription: { trial_end: unixAfter(60 * 60000) } }, NOW).message, "Trial Ends Today");
  assert.equal(getBillingDisplay({ access: false, status: "trialing", subscription: { trial_end: unixAfter(-1000) } }, NOW).message, "Trial Expired — Choose a plan to continue");
});

test("renders active, canceled and owner states", () => {
  assert.equal(getBillingDisplay({ access: true, status: "active" }, NOW).message, "Subscription Active");
  assert.equal(getBillingDisplay({ access: true, status: "canceled" }, NOW).message, "Subscription Active");
  assert.equal(getBillingDisplay({ access: true, status: "canceled", reason: "ok" }, NOW).message, "Pro Access Active — Renewal Canceled");
  assert.equal(getBillingDisplay({ access: false, status: "canceled" }, NOW).message, "Subscription Ended — Choose a plan to continue");
  assert.equal(getBillingDisplay({ access: true, owner_mode: true }, NOW).message, "Owner Mode — Subscription Active");
});

test("controls lock SEO and show trial CTA when access is absent", () => {
  const generateButton = { disabled: false };
  const trialButton = { hidden: true };
  const statusElement = { textContent: "", dataset: {} };
  const result = renderBillingControls({ billing: { access: false, status: "inactive" }, generateButton, trialButton, statusElement, nowMs: NOW });
  assert.equal(result.access, false);
  assert.equal(generateButton.disabled, true);
  assert.equal(trialButton.hidden, false);
  assert.match(statusElement.textContent, /available plan/);
});

test("workspace purchase route follows the verified provider and first payment", () => {
  const stripe = { access: true, reason: "ok", status: "active", plan: { key: "pro" },
    stripe_workspace_paid_pro: true, stripe_workspace_checkout_enabled: true, stripe_workspace_addons: [] };
  assert.equal(getWorkspacePurchaseState(stripe).canBuyStripe, true);
  assert.equal(getWorkspacePurchaseState({ ...stripe, status: "trialing", stripe_workspace_paid_pro: false }).canBuyStripe, false);
  assert.equal(getWorkspacePurchaseState({ ...stripe, stripe_workspace_addons: Array(9).fill({}) }).canBuyStripe, false);
  const play = { ...stripe, reason: "play_verified", play: { paid_pro: true } };
  assert.equal(getWorkspacePurchaseState(play).provider, "play");
  assert.equal(getWorkspacePurchaseState(play).canBuyStripe, false);
  assert.equal(getWorkspacePurchaseState(play).showWebsiteCard, true);
  assert.equal(getWorkspacePurchaseState(stripe, true).canBuyStripe, false);
});
