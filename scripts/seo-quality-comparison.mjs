const baseUrl = (process.env.SEO_TEST_BASE_URL || "http://127.0.0.1:8787/api").replace(/\/+$/, "");
const imageFixtureUrl = "https://images.unsplash.com/photo-1562967914-608f82629710?w=640&auto=format&fit=crop";

async function loadImageFixtureDataUrl() {
  const res = await fetch(imageFixtureUrl, {
    headers: { "User-Agent": "multi-post-dashboard-seo-test/1.0" }
  });
  if (!res.ok) throw new Error(`Unable to fetch image fixture: ${res.status}`);
  const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  const bytes = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

const imageFixtureDataUrl = await loadImageFixtureDataUrl();

const legacyQualityBaseline = {
  facebook: {
    title: "Street Food Launch That Stops The Scroll",
    description: "Discover a bold street food launch with crisp visuals, fresh flavour cues, and a share-ready hook for local food fans.",
    hashtags: ["#StreetFood", "#FoodLaunch", "#LocalFood", "#FoodReels", "#FreshFlavour"],
    keywords: ["street food launch", "local food fans", "food reels", "fresh flavour", "new menu ideas", "restaurant marketing", "food content", "small business food", "visual food post", "social food campaign"]
  },
  instagram: {
    title: "Fresh Street Food Visuals For Food Fans",
    description: "Turn a bold food image into save-worthy Instagram copy with sensory details, local discovery terms, and niche hashtags.",
    hashtags: ["#StreetFood", "#FoodGram", "#FoodieFinds", "#LocalEats", "#FoodPhotography"],
    keywords: ["instagram food caption", "street food photography", "local eats", "foodie finds", "new menu launch", "visual menu marketing", "food hashtags", "restaurant instagram", "food discovery", "fresh street food"]
  },
  tiktok: {
    title: "Street Food Hook For The For You Page",
    description: "A fast, sensory caption built around the food reveal, audience curiosity, and discovery hashtags.",
    hashtags: ["#StreetFood", "#FoodTok", "#fyp", "#foryoupage", "#LocalEats"],
    keywords: ["foodtok hook", "street food tiktok", "local eats tiktok", "food reveal", "viral food caption", "new menu tiktok", "food creator keywords", "restaurant tiktok seo", "short food video", "for you food post"],
    allInOne: "This street food reveal deserves a second look 🔥 #StreetFood #FoodTok #fyp #foryoupage #LocalEats"
  },
  youtubeShorts: {
    title: "Street Food Launch Built For Shorts Discovery",
    description: "A punchy YouTube Shorts setup using street food keywords, visual flavour cues, and local discovery terms to help the post surface in search.",
    hashtags: ["#StreetFood", "#YouTubeShorts", "#FoodShorts", "#LocalEats", "#FoodLaunch"],
    keywords: ["youtube shorts food", "street food shorts", "food launch video", "local food discovery", "shorts seo keywords", "restaurant shorts", "food content strategy", "new menu shorts", "street food marketing", "food video title"]
  }
};

const cases = [
  {
    name: "text prompt only",
    payload: {
      topic: "Launch a new spicy Korean chicken street food box for students in Manchester. Make it feel current, affordable, and craveable.",
      folder_name: "Campus Bites",
      facebook_account: "Campus Bites Manchester",
      instagram_account: "Campus Bites Instagram",
      tiktok_account: "Campus Bites TikTok",
      youtube_channel: "Campus Bites Shorts"
    }
  },
  {
    name: "image only",
    payload: {
      image_url: imageFixtureDataUrl,
      folder_name: "Campus Bites",
      facebook_account: "Campus Bites Manchester",
      instagram_account: "Campus Bites Instagram",
      tiktok_account: "Campus Bites TikTok",
      youtube_channel: "Campus Bites Shorts"
    }
  },
  {
    name: "image and text prompt together",
    payload: {
      topic: "Use the uploaded food image for a limited-time spicy Korean chicken student lunch deal near Manchester universities.",
      image_url: imageFixtureDataUrl,
      folder_name: "Campus Bites",
      facebook_account: "Campus Bites Manchester",
      instagram_account: "Campus Bites Instagram",
      tiktok_account: "Campus Bites TikTok",
      youtube_channel: "Campus Bites Shorts"
    }
  }
];

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value || "").split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
}

function platformScore(platform) {
  const title = String(platform?.title || "");
  const description = String(platform?.description || platform?.descriptionAndTags || "");
  const hashtags = toArray(platform?.hashtags || description.match(/#[\w]+/g) || []);
  const keywords = toArray(platform?.keywords || platform?.tags || "");
  let score = 0;
  if (title.length >= 25) score += 2;
  if (description.length >= 80) score += 3;
  if (hashtags.length >= 5) score += 2;
  if (keywords.length >= 10) score += 3;
  if (new Set([...hashtags, ...keywords].map((item) => item.toLowerCase())).size >= 14) score += 2;
  return score;
}

function totalScore(data) {
  return ["facebook", "instagram", "tiktok", "youtubeShorts"].reduce((sum, platform) => {
    return sum + platformScore(data?.[platform]);
  }, 0);
}

function assertPlatformShape(data, caseName) {
  for (const platform of ["facebook", "instagram", "tiktok", "youtubeShorts"]) {
    const item = data?.[platform];
    if (!item) throw new Error(`${caseName}: missing ${platform}`);
    if (!String(item.title || "").trim()) throw new Error(`${caseName}: missing ${platform} title`);
    if (!String(item.description || item.descriptionAndTags || "").trim()) throw new Error(`${caseName}: missing ${platform} description`);
    if (toArray(item.hashtags || String(item.descriptionAndTags || "").match(/#[\w]+/g) || []).length < 5) {
      throw new Error(`${caseName}: ${platform} needs at least 5 hashtags`);
    }
    if (toArray(item.keywords || item.tags || "").length < 10) {
      throw new Error(`${caseName}: ${platform} needs at least 10 keywords`);
    }
    if (Number(item.confidence || 0) < 0.78) {
      throw new Error(`${caseName}: ${platform} confidence is below threshold`);
    }
  }
  if (Number(data?.confidence || 0) < 0.78) {
    throw new Error(`${caseName}: top-level confidence is below threshold`);
  }
  if (!String(data?.tiktok?.allInOne || "").includes("#")) {
    throw new Error(`${caseName}: TikTok allInOne caption must include hashtags`);
  }
}

async function runCase(testCase) {
  const res = await fetch(`${baseUrl}/generate-seo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testCase.payload)
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`${testCase.name}: ${json.error || `HTTP ${res.status}`} ${JSON.stringify(json.qualityIssues || [])}`);
  }
  const data = json.data || {};
  assertPlatformShape(data, testCase.name);
  const newScore = totalScore(data);
  const baselineScore = totalScore(legacyQualityBaseline);
  if (newScore < baselineScore) {
    throw new Error(`${testCase.name}: Cloudflare score ${newScore} is below legacy quality baseline ${baselineScore}`);
  }
  return {
    case: testCase.name,
    model: json.model,
    score: newScore,
    baselineScore,
    confidence: data.confidence,
    facebookTitle: data.facebook.title,
    instagramTitle: data.instagram.title,
    tiktokTitle: data.tiktok.title,
    youtubeShortsTitle: data.youtubeShorts.title
  };
}

const results = [];
for (const testCase of cases) {
  results.push(await runCase(testCase));
}

console.log(JSON.stringify({ baseUrl, passed: true, results }, null, 2));
