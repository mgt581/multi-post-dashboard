const groupList = document.getElementById("groupList");
const addGroupBtn = document.getElementById("addGroupBtn");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const postIdea = document.getElementById("postIdea");
const output = document.getElementById("output");

// Load groups from localStorage or start empty
let groups = JSON.parse(localStorage.getItem("groups")) || [];

// Save groups helper
function saveGroups() {
  localStorage.setItem("groups", JSON.stringify(groups));
}

// Render groups
function renderGroups() {
  groupList.innerHTML = "";
  groups.forEach((g, index) => {
    const li = document.createElement("li");
    li.textContent = g;
    li.onclick = () => selectGroup(index);
    groupList.appendChild(li);
  });
}

// Add group
addGroupBtn.onclick = () => {
  const name = prompt("Group name?");
  if (!name) return;

  groups.push(name);
  saveGroups();
  renderGroups();
};

// Optional: track selected group (future use)
let activeGroup = null;

function selectGroup(index) {
  activeGroup = groups[index];
  document.querySelector(".main h1").textContent =
    `Create Post – ${activeGroup}`;
}

// Generate captions
generateBtn.onclick = () => {
  const idea = postIdea.value;
  if (!idea) return;

  output.value = `
GROUP: ${activeGroup || "No group selected"}

FACEBOOK:
${idea} – Professional, trustworthy, clear CTA.

INSTAGRAM:
${idea} 🔥 Clean, visual, hashtag-friendly.

TIKTOK:
${idea} 😮 Short. Punchy. Scroll-stopping.

YOUTUBE:
${idea} | Searchable title + long description.

#hashtags #seo #contentcreator
  `;
};

// Copy output
copyBtn.onclick = () => {
  output.select();
  document.execCommand("copy");
};

// Initial render on load
renderGroups();
