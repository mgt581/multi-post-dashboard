// App.js 

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
// SIMPLE GENERATOR HELPERS
// -----------------------------
function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function generateYouTubeTitle(idea, brand) {
  const cleanIdea = cleanText(idea);
  const cleanBrand = cleanText(brand);

  if (!cleanIdea) return cleanBrand || "YouTube Video";
  return `${cleanIdea} | ${cleanBrand}`;
}

function generateFacebookPost(idea, brand, hashtags) {
  const cleanIdea = cleanText(idea);
  const cleanBrand = cleanText(brand);

  return `${cleanBrand}\n${cleanIdea}\n\n${hashtags}`.trim();
}

function generateInstagramCaption(idea, hashtags) {
  const cleanIdea = cleanText(idea);
  return `${cleanIdea} 🔥\n\n${hashtags}`.trim();
}

function generateTikTokCaption(idea, hashtags) {
  const cleanIdea = cleanText(idea);

  // Slightly stronger fallback than just copying raw text with no structure
  if (/^pov[:\s-]/i.test(cleanIdea)) {
    return `${cleanIdea} 😮\n\n${hashtags}`.trim();
  }

  return `POV: ${cleanIdea} 😮\n\n${hashtags}`.trim();
}

// -----------------------------
// GENERATE CONTENT (AI + FALLBACK)
// -----------------------------
generateBtn &&
  (generateBtn.onclick = async () => {
    const idea = (postIdea?.value || "").trim();
    if (!idea) return;

    const originalBtnText = generateBtn.innerText;
    generateBtn.innerText = "Optimizing SEO...";
    generateBtn.disabled = true;

    try {
      const response = await fetch("/api/generate-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: idea,
          folder_id: activeFolder?.id || "",
          folder_name: activeFolder?.name || "Your Brand"
        })
      });

      const result = await response.json();

      if (result.success && !result.fallbackUsed) {
        // --- FACEBOOK & INSTAGRAM ---
        if (outputs.facebook) outputs.facebook.value = result.data.facebook.descriptionAndTags;
        if (outputs.instagram) {
          const instagram = result.data.instagram || result.data.facebook;
          outputs.instagram.value = instagram.descriptionAndTags || [
            instagram.title,
            instagram.description,
            Array.isArray(instagram.hashtags) ? instagram.hashtags.join(" ") : instagram.hashtags
          ].filter(Boolean).join("\n\n");
        }

        // --- YOUTUBE ---
        if (outputs.youtube) {
          outputs.youtube.value = `TITLE: ${result.data.youtube.title}\n\n${result.data.youtube.description}\n\nTAGS: ${result.data.youtube.keywords}`;
        }

        // --- TIKTOK (ENHANCED SEO) ---
        if (outputs.tiktok) {
          // We ensure the TikTok caption has a clean 'Hook' followed by the AI tags
          const rawTikTok = result.data.tiktok.allInOne;
          outputs.tiktok.value = rawTikTok.includes("#") 
            ? rawTikTok 
            : `${rawTikTok}\n\n#fyp #foryou #viral #trending`;
        }
        
        console.log("TikTok & Multi-Platform SEO live.");
      } else {
        throw new Error("AI Fallback triggered");
      }

    } catch (err) {
      console.warn("AI failed, using local backup.");
      
      const brand = activeFolder?.name ? String(activeFolder.name) : "Your Brand";
      const brandTag = brand.replace(/[^\w\s]/g, "").replace(/\s+/g, "");
      const hashtags = brandTag ? `#${brandTag}` : "";

      if (outputs.facebook) outputs.facebook.value = generateFacebookPost(idea, brand, hashtags);
      if (outputs.instagram) outputs.instagram.value = generateInstagramCaption(idea, hashtags);
      if (outputs.tiktok) outputs.tiktok.value = generateTikTokCaption(idea, hashtags);
      if (outputs.youtube) outputs.youtube.value = generateYouTubeTitle(idea, brand);
    } finally {
      generateBtn.innerText = originalBtnText;
      generateBtn.disabled = false;
    }
  });

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
