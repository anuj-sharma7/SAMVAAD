"use client";

/**
 * Shrinks a photo in the browser to a JPEG of at most `maxBytes`, returned as base64 (no data: prefix).
 * Re-drawing on a canvas also drops EXIF data such as GPS location and the camera model, so nothing hidden is uploaded.
 */
export async function shrinkImage(file: File, maxBytes = 170_000): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("unreadable_image");
  });
  let longSide = 1280;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("unreadable_image");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    for (const q of [0.75, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= maxBytes) return toBase64(await blob.arrayBuffer());
    }
    longSide = Math.round(longSide * 0.75);
  }
  bitmap.close?.();
  throw new Error("too_large");
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
