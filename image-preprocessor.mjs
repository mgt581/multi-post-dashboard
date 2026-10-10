export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_SEO_IMAGE_BYTES = 3.5 * 1024 * 1024;
export const MAX_SEO_IMAGE_EDGE = 2048;

const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export class ImageProcessingError extends Error {
  constructor(message, code = "IMAGE_PROCESSING_FAILED") {
    super(message);
    this.name = "ImageProcessingError";
    this.code = code;
  }
}

export function imageExtension(filename = "") {
  return String(filename).split(".").pop()?.toLowerCase() || "";
}

export function isSupportedImageFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  return SUPPORTED_MIME_TYPES.has(mime) || SUPPORTED_EXTENSIONS.has(imageExtension(file?.name));
}

export function containDimensions(width, height, maxEdge = MAX_SEO_IMAGE_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ImageProcessingError("The photo has invalid dimensions.", "INVALID_DIMENSIONS");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new ImageProcessingError("This browser could not compress the photo.")),
    "image/jpeg", quality
  ));
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (_) {}
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new ImageProcessingError(
        /hei[cf]/i.test(`${file.type} ${file.name}`)
          ? "This browser cannot read this HEIC/HEIF photo. Export it as JPEG, or choose ‘Most Compatible’ in your phone camera settings."
          : "This image could not be read. It may be damaged or use an unsupported format.",
        "DECODE_FAILED"
      ));
      image.src = objectUrl;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function preprocessImageFile(file) {
  if (!file) throw new ImageProcessingError("Choose a photo to continue.", "NO_FILE");
  if (!isSupportedImageFile(file)) throw new ImageProcessingError("Choose a JPEG, PNG, WebP, HEIC or HEIF image.", "UNSUPPORTED_FORMAT");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageProcessingError(`This photo is ${formatBytes(file.size)}. Choose one smaller than 25 MB.`, "SOURCE_TOO_LARGE");
  }
  const decoded = await decodeImage(file);
  try {
    let dimensions = containDimensions(decoded.width, decoded.height);
    let quality = 0.88;
    let blob;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new ImageProcessingError("This browser cannot process images.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_SEO_IMAGE_BYTES) break;
      if (quality > 0.68) quality -= 0.08;
      else dimensions = containDimensions(Math.round(dimensions.width * 0.82), Math.round(dimensions.height * 0.82));
    }
    if (!blob || blob.size > MAX_SEO_IMAGE_BYTES) {
      throw new ImageProcessingError("This photo could not be reduced enough for AI analysis. Try a smaller image.", "OUTPUT_TOO_LARGE");
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new ImageProcessingError("The processed photo could not be prepared."));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, blob, width: dimensions.width, height: dimensions.height, originalBytes: file.size, mimeType: "image/jpeg" };
  } finally {
    decoded.close();
  }
}
