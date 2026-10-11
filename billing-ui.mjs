const DAY_MS = 24 * 60 * 60 * 1000;

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

  return { kind: "inactive", message: "Unlock AI SEO generation with your 7-day free trial.", access: false };
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
