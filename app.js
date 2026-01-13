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
