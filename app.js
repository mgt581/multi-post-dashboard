// --- WORKER HANDLER (Fixes the "Red X" Deployment) ---
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve the API request for SEO
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const body = await request.json();
        // Here you would normally call an AI service. 
        // For now, we return a structured response for your HTML to read.
        return new Response(JSON.stringify({
          success: true,
          data: {
            youtube: {
              title: "SEO Optimized: " + body.prompt,
              description: "This is a generated description for " + body.prompt,
              hashtags: "#trending #videopost"
            }
          }
        }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
      }
    }

    // Default: If you are using Cloudflare Pages, the worker will pass through 
    // to your static HTML files automatically.
    return fetch(request);
  }
};

// --- YOUR DASHBOARD LOGIC (Fixes the Frontend) ---

document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generateBtn");
  const postIdea = document.getElementById("postIdea");
  const copyBtn = document.getElementById("copyBtn");
  
  const outputs = {
    facebook: document.getElementById("facebook"),
    instagram: document.getElementById("instagram"),
    tiktok: document.getElementById("tiktok"),
    youtube: document.getElementById("youtube"),
  };

  const tabs = document.querySelectorAll(".tab");
  const folders = JSON.parse(localStorage.getItem("folders")) || [];
  const activeFolderIndex = localStorage.getItem("activeFolder");
  const activeFolder = folders[activeFolderIndex] || null;

  let activePlatform = activeFolder?.accounts?.[0]?.platform || "facebook";

  // Tab switching logic
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activePlatform = tab.dataset.platform;
      Object.keys(outputs).forEach(key => {
        if(outputs[key]) outputs[key].classList.add("hidden");
      });
      if(outputs[activePlatform]) outputs[activePlatform].classList.remove("hidden");
    };
  });

  // Generate Button logic
  if (generateBtn) {
    generateBtn.onclick = async () => {
      const idea = postIdea.value.trim();
      if (!idea) return;

      generateBtn.innerText = "Generating...";
      generateBtn.disabled = true;

      const brand = activeFolder ? activeFolder.name : "Your Brand";
      const hashtags = activeFolder ? `#${brand.replace(/\s+/g, "")}` : "";

      // Fill basic UI
      if(outputs.facebook) outputs.facebook.value = `${brand}\n${idea}\n\n${hashtags}`;
      
      // Call the Internal API we created above
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: idea })
        });
        const json = await res.json();
        
        if (json.success && outputs.youtube) {
          outputs.youtube.value = `${json.data.youtube.title}\n\n${json.data.youtube.description}`;
        }
      } catch (err) {
        console.error("Failed to fetch SEO:", err);
      } finally {
        generateBtn.innerText = "Generate Content";
        generateBtn.disabled = false;
      }
    };
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      const target = outputs[activePlatform];
      if (target) {
        target.select();
        document.execCommand("copy");
      }
    };
  }
});
