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
const folders = JSON.parse(localStorage.getItem("folders")) || [];
const activeFolderIndex = localStorage.getItem("activeFolder");
const activeFolder = folders[activeFolderIndex] || null;

// -----------------------------
// PLATFORM STATE
// -----------------------------
let activePlatform =
  activeFolder?.accounts?.[0]?.platform || "facebook";

// -----------------------------
// HIDE UNUSED TABS
// -----------------------------
if (activeFolder && activeFolder.accounts) {
  const enabled = activeFolder.accounts.map(a => a.platform);

  tabs.forEach(tab => {
    if (!enabled.includes(tab.dataset.platform)) {
      tab.style.display = "none";
    }
  });
}

// -----------------------------
// ✅ EMPTY STATE FIX (no folders / no active folder)
// -----------------------------
(function ensureFolderSelected() {
  // If there are literally no folders saved yet, don't blow up later.
  // Show a helpful message in the UI areas we DO have.
  if (!folders.length) {
    // If you have a visual element to show errors, use it.
    // Otherwise we safely set placeholder text so the page isn't "broken".
    if (postIdea) {
      postIdea.placeholder = "No brands yet — create a brand/folder first, then come back here.";
    }

    // Disable actions that require a folder
    if (generateBtn) generateBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;

    // Also hide tabs except maybe the first, since nothing is linked
    tabs.forEach((tab, i) => {
      tab.style.display = i === 0 ? "" : "none";
    });

    // Make sure output boxes aren't confusing
    Object.keys(outputs).forEach(key => {
      if (outputs[key]) outputs[key].value = "No brand loaded. Create a brand/folder first.";
    });

    // Stop here (everything else can still exist, but won't error)
    return;
  }

  // If folders exist but active index is missing/invalid, default to first folder.
  const idx = Number(activeFolderIndex);
  const validIndex = Number.isInteger(idx) && idx >= 0 && idx < folders.length;

  if (!validIndex) {
    localStorage.setItem("activeFolder", "0");
  }
})();

// -----------------------------
// TAB SWITCHING
// -----------------------------
tabs.forEach(tab => {
  tab.onclick = () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    activePlatform = tab.dataset.platform;

    Object.keys(outputs).forEach(key => {
      outputs[key].classList.add("hidden");
    });

    outputs[activePlatform].classList.remove("hidden");
  };
});

// -----------------------------
// GENERATE CONTENT
// -----------------------------
generateBtn.onclick = () => {
  const idea = postIdea.value.trim();
  if (!idea) return;

  const brand = activeFolder
    ? activeFolder.name
    : "Your Brand";

  const hashtags = activeFolder
    ? `#${brand.replace(/\s+/g, "")}`
    : "";

  outputs.facebook.value = `${brand}\n${idea}\n\n${hashtags}`;
  outputs.instagram.value = `${idea} 🔥\n\n${hashtags}`;
  outputs.tiktok.value = `${idea} 😮\n\n${hashtags}`;
  outputs.youtube.value = `${idea} | ${brand}`;
};

// -----------------------------
// COPY BUTTON
// -----------------------------
copyBtn.onclick = () => {
  outputs[activePlatform].select();
  document.execCommand("copy");
};
