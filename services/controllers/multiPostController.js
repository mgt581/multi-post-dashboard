import { publishTikTok } from "../services/tiktokUpload.js";
import { publishFacebook } from "../services/facebookUpload.js";

export async function publishVideo(videoPath, userSelectedPlatforms) {
  const results = {};

  try {
    if (userSelectedPlatforms.tiktok) {
      results.tiktok = await publishTikTok(videoPath, process.env.TIKTOK_ACCESS_TOKEN);
    }

    if (userSelectedPlatforms.facebook) {
      results.facebook = await publishFacebook(videoPath, process.env.FB_ACCESS_TOKEN, process.env.FB_PAGE_ID);
    }

    return results;
  } catch (err) {
    console.error(err);
    throw err;
  }
}
