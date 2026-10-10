import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAX_SEO_IMAGE_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  containDimensions,
  formatBytes,
  imageExtension,
  isSupportedImageFile
} from "../image-preprocessor.mjs";

test("accepts supported phone-photo formats even when the browser omits MIME type", () => {
  for (const [name, type] of [
    ["portrait.JPG", "image/jpeg"], ["large.png", "image/png"], ["photo.webp", "image/webp"],
    ["IMG_0974.HEIC", ""], ["android.heif", "image/heif"]
  ]) assert.equal(isSupportedImageFile({ name, type }), true, name);
  assert.equal(isSupportedImageFile({ name: "clip.gif", type: "image/gif" }), false);
  assert.equal(imageExtension("IMG_0974.HEIC"), "heic");
});

test("scales portrait and landscape images to a 2048px long edge without upscaling", () => {
  assert.deepEqual(containDimensions(4032, 3024), { width: 2048, height: 1536 });
  assert.deepEqual(containDimensions(3024, 4032), { width: 1536, height: 2048 });
  assert.deepEqual(containDimensions(640, 480), { width: 640, height: 480 });
});

test("uses a 25MB source allowance and a smaller AI-safe encoded target", () => {
  assert.equal(MAX_SOURCE_IMAGE_BYTES, 25 * 1024 * 1024);
  assert.ok(MAX_SEO_IMAGE_BYTES < 5 * 1024 * 1024);
  assert.equal(formatBytes(8 * 1024 * 1024), "8.0 MB");
});

test("does not silently generate text-only SEO after photo processing fails", () => {
  const page = fs.readFileSync(new URL("../create-post.html", import.meta.url), "utf8");
  assert.match(page, /window\.seoImageError = error\.message/);
  assert.match(page, /if \(!imageUrl && window\.seoImageError\)/);
  assert.match(page, /setStatus\(window\.seoImageError, "error"\)/);
});
