// ELEMENTS
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
// LOAD FOLDER CONTEXT
// -----------------------------
function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

const folders = safeJsonParse(localStorage.getItem("folders"), []) || [];
const activeFolderIndexRaw = localStorage.getItem("activeFolder");

// activeFolderIndex might be null / "0" / "1" etc.
const activeFolderIndex =
  activeFolderIndexRaw === null || activeFolderIndexRaw === undefined
    ? null
    : Number(activeFolderIndexRaw);

const activeFolder =
  activeFolderIndex !== null &&
  Number.isFinite(activeFolderIndex) &&
  folders[activeFolderIndex]
    ? folders[activeFolderIndex]
    : null;

// -----------------------------
// PLATFORM STATE
// -----------------------------
let activePlatform = activeFolder?.accounts?.[0]?.platform || "facebook";

// Ensure the platform exists in outputs
if (!outputs[activePlatform]) activePlatform = "facebook";

// -----------------------------
// HIDE UNUSED TABS
// -----------------------------
function getEnabledPlatforms() {
  if (activeFolder && Array.isArray(activeFolder.accounts)) {
    return activeFolder.accounts
      .map((a) => a?.platform)
      .filter(Boolean);
  }
  // If no folder/accounts loaded, show all tabs
  return Object.keys(outputs);
}

function hideUnusedTabs() {
  const enabled = getEnabledPlatforms();

  tabs.forEach((tab) => {
    const p = tab?.dataset?.platform;
    if (!p) return;

    // Hide if not enabled
    if (!enabled.includes(p)) {
      tab.style.display = "none";
      tab.classList.remove("active");
    } else {
      tab.style.display = "";
    }
  });

  // Pick a valid active platform
  if (!enabled.includes(activePlatform)) {
    activePlatform = enabled[0] || "facebook";
  }
}

hideUnusedTabs();

// -----------------------------
// UI HELPERS
// -----------------------------
function showPlatform(platform) {
  // Tabs
  tabs.forEach((t) => t.classList.remove("active"));
  tabs.forEach((t) => {
    if (t?.dataset?.platform === platform) t.classList.add("active");
  });

  // Outputs
  Object.keys(outputs).forEach((key) => {
    const el = outputs[key];
    if (!el) return;
    el.classList.add("hidden");
  });

  if (outputs[platform]) {
    outputs[platform].classList.remove("hidden");
  }

  activePlatform = platform;
}

// -----------------------------
// TAB SWITCHING
// -----------------------------
tabs.forEach((tab) => {
  tab.onclick = () => {
    const platform = tab?.dataset?.platform;
    if (!platform || !outputs[platform]) return;
    showPlatform(platform);
  };
});

// Initial render to correct textarea/tab
showPlatform(activePlatform);

// -----------------------------
// GENERATE CONTENT
// -----------------------------
generateBtn &&
  (generateBtn.onclick = () => {
    const idea = (postIdea?.value || "").trim();
    if (!idea) return;

    const brand = activeFolder?.name ? String(activeFolder.name) : "Your Brand";

    // Keep hashtags clean
    const brandTag = brand.replace(/[^\w\s]/g, "").replace(/\s+/g, "");
    const hashtags = brandTag ? `#${brandTag}` : "";

    if (outputs.facebook)
      outputs.facebook.value = `${brand}\n${idea}\n\n${hashtags}`;
    if (outputs.instagram)
      outputs.instagram.value = `${idea} 🔥\n\n${hashtags}`;
    if (outputs.tiktok) outputs.tiktok.value = `${idea} 😮\n\n${hashtags}`;
    if (outputs.youtube)
      outputs.youtube.value = `${idea} | ${brand}`;
  });

// -----------------------------
// COPY BUTTON
// -----------------------------
async function copyText(text) {
  // Prefer modern clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Fallback: execCommand
  try {
    const el = outputs[activePlatform];
    if (!el) return false;
    el.focus();
    el.select();
    return document.execCommand("copy");
  } catch (e) {
    return false;
  }
}

copyBtn &&
  (copyBtn.onclick = async () => {
    const el = outputs[activePlatform];
    if (!el) return;

    const ok = await copyText(el.value || "");
    // Optional: tiny UX feedback without breaking anything
    if (ok) {
      copyBtn.innerText = "Copied!";
      setTimeout(() => (copyBtn.innerText = "Copy"), 900);
    }
  });
