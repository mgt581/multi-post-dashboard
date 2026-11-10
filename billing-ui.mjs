const DAY_MS = 24 * 60 * 60 * 1000;

export function getWorkspacePurchaseState(billing = {}, androidWrapper = false) {
  const provider = androidWrapper || billing.reason === "play_verified" ? "play"
    : billing.access && billing.reason === "ok" && billing.plan?.key === "pro" && !billing.owner_mode ? "stripe" : "none";
  const addons = Array.isArray(billing.stripe_workspace_addons) ? billing.stripe_workspace_addons : [];
  const atLimit = addons.length >= 9 || Number(billing.workspace_allowance || 0) >= 10;
  return {
    provider,
    addons,
    atLimit,
    showWebsiteCard: !androidWrapper && billing.access === true && billing.plan?.key === "pro" && !billing.owner_mode,
    canBuyStripe: provider === "stripe" && billing.status === "active" &&
      billing.stripe_workspace_paid_pro === true && billing.stripe_workspace_checkout_enabled === true && !atLimit
  };
}

export function getBillingDisplay(billing = {}, nowMs = Date.now()) {
  if (billing.owner_mode) {
    return { kind: "owner", message: "Owner Mode — Subscription Active", access: true };
  }

  const status = String(billing.status || "inactive").toLowerCase();
  const trialEndSeconds = Number(billing.subscription?.trial_end || 0);
  const trialEndMs = trialEndSeconds > 0 ? trialEndSeconds * 1000 : 0;

  if (billing.access && status === "trialing" && trialEndMs > nowMs) {
    const daysRemaining = Math.ceil((trialEndMs - nowMs) / DAY_MS);
    return {
      kind: "trial",
      message: daysRemaining <= 1
        ? "Trial Ends Today"
        : `Trial Active — ${daysRemaining} days remaining`,
      access: true,
      daysRemaining
    };
  }

  if (billing.access) {
    return { kind: "active", message: "Subscription Active", access: true };
  }

  if (status === "trialing" || (trialEndMs && trialEndMs <= nowMs)) {
    return { kind: "inactive", message: "Trial Expired — Choose a plan to continue", access: false };
  }

  if (["past_due", "unpaid", "incomplete", "incomplete_expired", "paused"].includes(status)) {
    return { kind: "inactive", message: "Subscription Inactive — Update your billing details", access: false };
  }

  if (status === "canceled") {
    return { kind: "inactive", message: "Subscription Ended — Choose a plan to continue", access: false };
  }

  return { kind: "inactive", message: "Choose an available plan to unlock AI SEO generation.", access: false };
}

export function renderBillingControls({ billing, generateButton, trialButton, statusElement, nowMs = Date.now() }) {
  const display = getBillingDisplay(billing, nowMs);
  if (generateButton) generateButton.disabled = !display.access;
  if (trialButton) trialButton.hidden = display.access;
  if (statusElement) {
    statusElement.textContent = display.message;
    statusElement.dataset.state = display.kind;
  }
  return display;
}
