import express from "express";
import { publishVideo } from "../controllers/multiPostController.js";

const router = express.Router();

// Route to handle video upload
// Frontend should send 'video' file + 'platforms' selection
router.post("/upload", async (req, res) => {
  // Multer saves uploaded file here
  const videoPath = req.file.path;

  // User's platform selection, e.g. { tiktok: true, facebook: false }
  const userSelectedPlatforms = req.body.platforms;

  try {
    // Call controller function to publish video to selected platforms
    const results = await publishVideo(videoPath, userSelectedPlatforms);

    // Return results to frontend
    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
