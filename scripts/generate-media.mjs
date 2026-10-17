#!/usr/bin/env node

/**
 * Sensifai Automated Media & Transparent Logo Verification Utility
 * (`scripts/generate-media.mjs`)
 */

import fs from "node:fs";

const REQUIRED_ASSETS = [
  { path: "media/logo.png", desc: "1:1 Minimalist Brand Logo (Transparent PNG)" },
  { path: "media/cover.png", desc: "16:9 Photorealistic Domain Cover (Text-Free)" },
  { path: "media/platform-mockup.png", desc: "16:9 Live Platform UI Screenshot" },
  { path: "public/images/hero.jpg", desc: "16:9 Landing Page Hero Photograph" },
  { path: "public/images/feature-1.jpg", desc: "Feature 1 Visual Card Asset" },
  { path: "public/images/feature-2.jpg", desc: "Feature 2 Visual Card Asset" },
  { path: "public/images/feature-3.jpg", desc: "Feature 3 Visual Card Asset" },
  { path: "public/images/platform-ui.png", desc: "16:9 Framed Product UI Screenshot" },
];

for (const dir of ["media", "public", "public/images"]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

console.log("=====================================================================");
console.log("  SENSIFAI Visual & Media Asset Readiness Check");
console.log("=====================================================================\n");

let missingCount = 0;
for (const item of REQUIRED_ASSETS) {
  const exists = fs.existsSync(item.path) && fs.statSync(item.path).size > 1024;
  if (exists) {
    const sizeKb = (fs.statSync(item.path).size / 1024).toFixed(1);
    console.log(`  ✓ PRESENT (${sizeKb} KB): ${item.path} — ${item.desc}`);
  } else {
    missingCount++;
    console.log(`  ✗ MISSING: ${item.path} — ${item.desc}`);
  }
}

if (fs.existsSync("media/logo.png")) {
  fs.copyFileSync("media/logo.png", "public/logo.png");
  console.log("  ✓ Synced media/logo.png -> public/logo.png for runtime Navbar & AppShell");
}

console.log("\n=====================================================================");
if (missingCount === 0) {
  console.log("  ALL 8 VISUAL & MEDIA ASSETS VERIFIED PRESENT");
} else {
  console.log(
    `  ${missingCount} ASSET(S) MISSING — Invoke 'sensifai-media-generation' skill now.`
  );
}
console.log("=====================================================================\n");
