// Client-side downscale before upload — caps photos at 4K on the long edge
// so a 48MP phone original becomes ~1–2MB of JPEG, saving both disk in the
// server's frame-photos.db and upload bandwidth over the LAN. Runs on a plain
// canvas, so it works in every browser over plain HTTP (no secure-context or
// Chromium-only APIs, unlike the old folder-picker flow).
const MAX_DIM = 3840;
const JPEG_QUALITY = 0.6;
const MAX_BYTES = 3 * 1024 * 1024;
const SKIP_BYTES = 1 * 1024 * 1024;

// file_ver in the query string is what lets the server send an `immutable`
// cache header — re-uploading a filename bumps the version, changing the URL.
export function photoFileUrl(photo) {
  return `/api/frame/photos/${photo.id}/file?v=${photo.file_ver ?? 0}`;
}

// Returns { blob, filename } ready for FormData. GIFs pass through untouched
// (a canvas re-encode would drop their animation); images already within 4K
// upload as-is; anything the browser can't decode is sent raw and left to
// render (or not) on the other side.
export async function prepareImage(file) {
  if (file.type === 'image/gif') return { blob: file, filename: file.name };
  if (file.size < SKIP_BYTES) return { blob: file, filename: file.name };

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { blob: file, filename: file.name };
  }

  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Re-encode at falling quality until under the 2MB cap.
  // ponytail: quality floor of 0.1 is a ceiling — a 4K-wide busy photo could
  // still land above 2MB; add a dimension-shrink fallback if that shows up.
  let quality = JPEG_QUALITY;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  while (blob && blob.size > MAX_BYTES && quality > 0.1) {
    quality -= 0.1;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }
  if (!blob) return { blob: file, filename: file.name };
  return { blob, filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}
