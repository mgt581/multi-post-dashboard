const groupList = document.getElementById("groupList");
const addGroupBtn = document.getElementById("addGroupBtn");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const postIdea = document.getElementById("postIdea");
const output = document.getElementById("output");

let groups = [];

addGroupBtn.onclick = () => {
  const name = prompt("Group name?");
  if (!name) return;
  groups.push(name);
  renderGroups();
};

function renderGroups() {
  groupList.innerHTML = "";
  groups.forEach(g => {
    const li = document.createElement("li");
    li.textContent = g;
    groupList.appendChild(li);
  });
}

generateBtn.onclick = () => {
  const idea = postIdea.value;
  if (!idea) return;

  output.value = `
FACEBOOK:
${idea} – Professional, trustworthy, clear CTA.

INSTAGRAM:
${idea} 🔥 Clean, visual, hashtag-friendly.

TIKTOK:
${idea} 😮 Short. Punchy. Scroll-stopping.

YOUTUBE:
${idea} | Full breakdown, searchable title, long description.

#hashtags #seo #contentcreator
  `;
};

copyBtn.onclick = () => {
  output.select();
  document.execCommand("copy");
};
