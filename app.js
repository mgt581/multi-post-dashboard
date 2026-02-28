// app.js (production-ready drop-in)
// Keeps your existing behaviour but makes it robust:
// - Safe localStorage parsing
// - Handles missing elements without blowing up
// - Works even if no activeFolder is set
// - Uses modern clipboard API with fallback

"use strict";

// -----------------------------
// HELPERS
// -----------------------------
function safeJsonParse(value, fallback) {
  try {
    if (value === null || value === undefined || value === "") return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugHashtag(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_]/gu, ""); // keep letters/numbers/underscore (unicode-safe)
}

async function copyText(text) {
  const value = String(text ?? "");
  // Prefer modern clipboard API (works on HTTPS + user gesture)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return true;
  }
  // Fallback for older browsers / iOS edge cases
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  return ok;
}

// -----------------------------
// ELEMENTS (guarded)
// -----------------------------
const groupList = document.getElementById("groupList");
const addGroupBtn = document.getElementById("addGroupBtn");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const postIdea = document.getElementById("postIdea");
const tabs = document.querySelectorAll(".tab");

const outputs = {
  facebook: document.getElementById("facebook"),
  instagram: document.getElementById("instagram"),
  tiktok: document.getElementById("tiktok"),
  youtube: document.getElementById("youtube"),
};

// -----------------------------
// LOAD FOLDER CONTEXT (robust)
// -----------------------------
const folders = safeJsonParse(localStorage.getItem("folders"), []);
let activeFolderIndex = localStorage.getItem("activeFolder");

// Normalize index
if (activeFolderIndex === null || activeFolderIndex === undefined || activeFolderIndex === "") {
  activeFolderIndex = "0";
}
if (!/^\d+$/.test(String(activeFolderIndex))) {
  activeFolderIndex = "0";
}

const activeFolder = folders[Number(activeFolderIndex)] || null;

// -----------------------------
// PLATFORM STATE
// -----------------------------
let activePlatform = (activeFolder?.accounts?.[0]?.platform) || "facebook";

// -----------------------------
// HIDE UNUSED TABS (if folder has limited platforms)
// -----------------------------
if (activeFolder && Array.isArray(activeFolder.accounts) && activeFolder.accounts.length > 0 && tabs.length) {
  const enabled = activeFolder.accounts
    .map(a => a?.platform)
    .filter(Boolean);

  tabs.forEach(tab => {
    const p = tab?.dataset?.platform;
    if (p && !enabled.includes(p)) {
      tab.style.display = "none";
    }
  });

  // Ensure activePlatform is valid
  if (!enabled.includes(activePlatform)) {
    activePlatform = enabled[0] || activePlatform;
  }
}

// -----------------------------
// TAB SWITCHING
// -----------------------------
if (tabs.length) {
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const next = tab?.dataset?.platform;
      if (next) activePlatform = next;

      Object.keys(outputs).forEach(key => {
        if (outputs[key]) outputs[key].classList.add("hidden");
      });

      if (outputs[activePlatform]) outputs[activePlatform].classList.remove("hidden");
    });
  });
}

// -----------------------------
// GENERATE CONTENT
// -----------------------------
if (generateBtn) {
  generateBtn.addEventListener("click", () => {
    const idea = (postIdea?.value || "").trim();
    if (!idea) return;

    const brand = activeFolder?.name ? String(activeFolder.name) : "Your Brand";
    const hashtag = slugHashtag(brand);
    const hashtags = hashtag ? `#${hashtag}` : "";

    if (outputs.facebook) outputs.facebook.value = `${brand}\n${idea}\n\n${hashtags}`;
    if (outputs.instagram) outputs.instagram.value = `${idea} 🔥\n\n${hashtags}`;
    if (outputs.tiktok) outputs.tiktok.value = `${idea} 😮\n\n${hashtags}`;
    if (outputs.youtube) outputs.youtube.value = `${idea} | ${brand}`;
  });
}

// -----------------------------
// COPY BUTTON
// -----------------------------
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const out = outputs[activePlatform];
    if (!out) return;

    try {
      const ok = await copyText(out.value);
      if (!ok) throw new Error("Copy failed");
    } catch {
      // last resort fallback: select text so user can manually copy
      out.focus();
      out.select?.();
    }
  });
}
