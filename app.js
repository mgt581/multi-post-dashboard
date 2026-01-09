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

// STATE
let groups = JSON.parse(localStorage.getItem("groups")) || [];
let activeGroupIndex = null;
let activePlatform = "facebook";

// HELPERS
function saveGroups() {
  localStorage.setItem("groups", JSON.stringify(groups));
}

function renderGroups() {
  groupList.innerHTML = "";
  groups.forEach((group, index) => {
    const li = document.createElement("li");
    li.textContent = group.name;
    li.onclick = () => selectGroup(index);
    groupList.appendChild(li);
  });
}

function selectGroup(index) {
  activeGroupIndex = index;
  const group = groups[index];

  document.querySelector(".main h1").textContent =
    `Create Post – ${group.name}`;

  brandCTA.value = group.cta || "";
  brandHashtags.value = group.hashtags || "";
  brandTone.value = group.tone || "professional";
}

// ADD GROUP
addGroupBtn.onclick = () => {
  const name = prompt("Group name?");
  if (!name) return;

  groups.push({
    name,
    cta: "",
    hashtags: "",
    tone: "professional",
  });

  saveGroups();
  renderGroups();
};

// BRAND SETTINGS SAVE
brandCTA.oninput = () => {
  if (activeGroupIndex === null) return;
  groups[activeGroupIndex].cta = brandCTA.value;
  saveGroups();
};

brandHashtags.oninput = () => {
  if (activeGroupIndex === null) return;
  groups[activeGroupIndex].hashtags = brandHashtags.value;
  saveGroups();
};

brandTone.onchange = () => {
  if (activeGroupIndex === null) return;
  groups[activeGroupIndex].tone = brandTone.value;
  saveGroups();
};

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
generateBtn.onclick = () => {
  const idea = postIdea.value.trim();
  if (!idea) return;

  const group =
    groups[activeGroupIndex] || {
      name: "Your Brand",
      cta: "",
      hashtags: "",
      tone: "professional",
    };

  const toneMap = {
    professional: "Clear, professional, trustworthy tone.",
    casual: "Relaxed, friendly, human tone.",
    aggressive: "Direct, confident, sales-focused tone.",
  };

  const tags = group.hashtags
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `#${t.replace(/\s+/g, "")}`)
    .join(" ");

  outputs.facebook.value =
`${group.name}
${idea}

${toneMap[group.tone]}
${group.cta}

${tags}`;

  outputs.instagram.value =
`${idea} 🔥

${group.cta}

${tags}`;

  outputs.tiktok.value =
`${idea} 😮
${group.cta}

${tags}`;

  outputs.youtube.value =
`${idea} | ${group.name}

${toneMap[group.tone]}
${group.cta}

Keywords: ${idea.toLowerCase()}, ${group.name.toLowerCase()}`;
};

// COPY BUTTON
copyBtn.onclick = () => {
  outputs[activePlatform].select();
  document.execCommand("copy");
};

// INIT
renderGroups();
