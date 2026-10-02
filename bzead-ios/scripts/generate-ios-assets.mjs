#!/usr/bin/env node
/**
 * Generate iOS AppIcon + Splash image assets for the Bzead iOS buyer app
 * from the repo-root /logo.png — visually 1:1 with the Android app branding
 * (bzead-android/scripts/generate-icons.mjs).
 *
 * - AppIcon: 1024×1024 full-bleed. The source logo is a yellow rounded
 *   badge with transparent padding. We trim the padding, sample the badge's
 *   yellow, then letterbox the logo on a same-yellow 1024 canvas. iOS applies
 *   its own corner mask, so the result is a seamless full-bleed yellow icon
 *   with the complete BZEAD wordmark — nothing cropped, no white corners.
 * - Splash: 2732×2732 white canvas with the logo centred at 55% of the
 *   canvas — same composition as the Android splash (white background,
 *   centred logo, no other artwork). The template's Contents.json maps the
 *   same file to the 1x/2x/3x scale entries.
 *
 * Usage: node scripts/generate-ios-assets.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WRAPPER_ROOT, '..');
const SOURCE = path.join(REPO_ROOT, 'logo.png');
const ASSETS_DIR = path.join(WRAPPER_ROOT, 'ios/App/App/Assets.xcassets');
const APPICON_DIR = path.join(ASSETS_DIR, 'AppIcon.appiconset');
const SPLASH_DIR = path.join(ASSETS_DIR, 'Splash.imageset');
const SPLASH_BACKGROUND = '#ffffff';

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/** Full-bleed 1024×1024 app icon on the badge's own yellow. */
async function generateAppIcon() {
  await ensureDir(APPICON_DIR);
  const trimmed = await sharp(SOURCE).trim().toBuffer();

  // Sample the badge colour 5px inside its left edge at mid-height — that
  // pixel is pure badge yellow, so the letterbox blends invisibly.
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const sampleIdx = (Math.floor(info.height / 2) * info.width + 5) * info.channels;
  const badgeColor = {
    r: data[sampleIdx],
    g: data[sampleIdx + 1],
    b: data[sampleIdx + 2],
  };

  const logo = await sharp(trimmed)
    .resize(1000, 1000, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { ...badgeColor, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(APPICON_DIR, 'AppIcon-512@2x.png'));

  console.log(
    `✅ AppIcon-512@2x.png (1024×1024 full-bleed, badge yellow rgb(${badgeColor.r},${badgeColor.g},${badgeColor.b})) generated`
  );
}

/** 2732×2732 splash — white background, centred logo (Android parity). */
async function generateSplash() {
  await ensureDir(SPLASH_DIR);
  const canvas = 2732;
  const logoSize = Math.round(canvas * 0.55);

  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, { fit: 'contain' })
    .png()
    .toBuffer();

  const splash = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: SPLASH_BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();

  // Contents.json maps one filename to each of the 1x/2x/3x scales — all
  // three entries use the same 2732×2732 image.
  const targets = [
    'splash-2732x2732.png',
    'splash-2732x2732-1.png',
    'splash-2732x2732-2.png',
  ];
  for (const name of targets) {
    await sharp(splash).png().toFile(path.join(SPLASH_DIR, name));
  }

  console.log('✅ Splash.imageset (2732×2732 ×3, white background) generated');
}

async function main() {
  if (!existsSync(SOURCE)) {
    throw new Error(`Source logo not found: ${SOURCE}`);
  }
  await generateAppIcon();
  await generateSplash();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
