// ELEMENTS
const groupList = document.getElementById("groupList");
const addGroupBtn = document.getElementById("addGroupBtn");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const postIdea = document.getElementById("postIdea");

const brandCTA = document.getElementById("brandCTA");
const brandHashtags = document.getElementById("brandHashtags");
const brandTone = document.getElementById("brandTone");

const tabs = document.querySelectorAll(".tab");

const outputs = {
  facebook: document.getElementById("facebook"),
  instagram: document.getElementById("instagram"),
  tiktok: document.getElementById("tiktok"),
  youtube: document.getElementById("youtube"),
};

// STATE — ONE SOURCE OF TRUTH
let folders = JSON.parse(localStorage.getItem("folders")) || [];
let activeFolderIndex = null;
let activePlatform = "facebook";

// HELPERS
function saveFolders() {
  localStorage.setItem("folders", JSON.stringify(folders));
}

// RENDER FOLDERS
function renderFolders() {
  if (!groupList) return;

  groupList.innerHTML = "";

  folders.forEach((folder, index) => {
    const li = document.createElement("li");
    li.textContent = folder.name;
    li.onclick = () => selectFolder(index);
    groupList.appendChild(li);
  });
}

// SELECT FOLDER
function selectFolder(index) {
  activeFolderIndex = index;
  const folder = folders[index];

  document.querySelector(".main h1").textContent =
    `Create Post – ${folder.name}`;

  brandCTA.value = folder.brand?.cta || "";
  brandHashtags.value = folder.brand?.hashtags || "";
  brandTone.value = folder.brand?.tone || "professional";
}

// ADD FOLDER (from post creator page)
if (addGroupBtn) {
  addGroupBtn.onclick = () => {
    const name = prompt("Folder name?");
    if (!name) return;

    folders.push({
      name,
      brand: {
        cta: "",
        hashtags: "",
        tone: "professional",
      },
      accounts: [],
    });

    saveFolders();
    renderFolders();
  };
}

// BRAND SETTINGS SAVE
if (brandCTA) {
  brandCTA.oninput = () => {
    if (activeFolderIndex === null) return;
    folders[activeFolderIndex].brand.cta = brandCTA.value;
    saveFolders();
  };
}

if (brandHashtags) {
  brandHashtags.oninput = () => {
    if (activeFolderIndex === null) return;
    folders[activeFolderIndex].brand.hashtags = brandHashtags.value;
    saveFolders();
  };
}

if (brandTone) {
  brandTone.onchange = () => {
    if (activeFolderIndex === null) return;
    folders[activeFolderIndex].brand.tone = brandTone.value;
    saveFolders();
  };
}

// TAB SWITCHING
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

// GENERATE CONTENT
if (generateBtn) {
  generateBtn.onclick = () => {
    const idea = postIdea.value.trim();
    if (!idea) return;

    const folder =
      folders[activeFolderIndex] || {
        name: "Your Brand",
        brand: { cta: "", hashtags: "", tone: "professional" },
      };

    const toneMap = {
      professional: "Clear, professional, trustworthy tone.",
      casual: "Relaxed, friendly, human tone.",
      aggressive: "Direct, confident, sales-focused tone.",
    };

    const tags = folder.brand.hashtags
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => `#${t.replace(/\s+/g, "")}`)
      .join(" ");

    outputs.facebook.value =
`${folder.name}
${idea}

${toneMap[folder.brand.tone]}
${folder.brand.cta}

${tags}`;

    outputs.instagram.value =
`${idea} 🔥

${folder.brand.cta}

${tags}`;

    outputs.tiktok.value =
`${idea} 😮
${folder.brand.cta}

${tags}`;

    outputs.youtube.value =
`${idea} | ${folder.name}

${toneMap[folder.brand.tone]}
${folder.brand.cta}

Keywords: ${idea.toLowerCase()}, ${folder.name.toLowerCase()}`;
  };
}

// COPY BUTTON
if (copyBtn) {
  copyBtn.onclick = () => {
    outputs[activePlatform].select();
    document.execCommand("copy");
  };
}

// INIT
renderFolders();