/**
 * The Android app build offered for download from the website.
 *
 * When a new APK is copied to `public/downloads/SAMVAAD.apk`, update this record (version, date, size, checksum).
 * `tests/app-release.test.ts` fails if the numbers here do not match the real file, so the page can never advertise
 * a version or a checksum that is wrong.
 */
export const APP_RELEASE = {
  version: "0.5.0",
  /** A debug-signed test build. A signed release build is on the roadmap. */
  channel: "debug",
  builtOn: "2026-11-01",
  /** Public URL of the file (served from /public). */
  url: "/downloads/SAMVAAD.apk",
  /** Name the file gets on the phone. */
  fileName: "SAMVAAD-v0.5.0-debug.apk",
  sizeBytes: 9196426,
  sha256: "3f1c154381087c5ea27d010a33f53d4297329e51f264338dc3bac32594afa5ad",
  minAndroid: "8.0",
} as const;

/** "8.8 MB" style size for display. */
export const apkSizeLabel = (bytes: number = APP_RELEASE.sizeBytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
