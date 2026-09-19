#!/usr/bin/env node
/**
 * Generate Android adaptive + legacy launcher icons and splash screens
 * directly from /logo.png 1:1 with NO trim, NO fit-cover distortion.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, 'logo.png');
const RES_DIR = path.join(ROOT, 'bzead-android/android/app/src/main/res');

const DENSITIES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const FOREGROUND_DENSITIES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

const PLAY_STORE = { size: 512, out: path.join(ROOT, 'bzead-android/android/app/src/main/play-store-icon.png') };

const SPLASH_BACKGROUND = '#ffffff';

const SPLASH_PORTRAIT = {
  mdpi: { w: 320, h: 480 },
  hdpi: { w: 480, h: 800 },
  xhdpi: { w: 720, h: 1280 },
  xxhdpi: { w: 960, h: 1600 },
  xxxhdpi: { w: 1280, h: 1920 },
};

const SPLASH_LANDSCAPE = {
  mdpi: { w: 480, h: 320 },
  hdpi: { w: 800, h: 480 },
  xhdpi: { w: 1280, h: 720 },
  xxhdpi: { w: 1600, h: 960 },
  xxxhdpi: { w: 1920, h: 1280 },
};

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function generateLauncherIcons() {
  // Use logo.png directly without trim or cover distortion
  const iconBuffer = await sharp(SOURCE).toBuffer();

  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = path.join(RES_DIR, `mipmap-${density}`);
    await ensureDir(dir);

    // Legacy square
    await sharp(iconBuffer)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Round icon
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
    );
    await sharp(iconBuffer)
      .resize(size, size, { fit: 'contain' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // Adaptive foreground (108dp canvas)
    const fgSize = FOREGROUND_DENSITIES[density];
    await sharp(iconBuffer)
      .resize(fgSize, fgSize, { fit: 'contain' })
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Play Store icon
  await ensureDir(path.dirname(PLAY_STORE.out));
  await sharp(iconBuffer)
    .resize(PLAY_STORE.size, PLAY_STORE.size, { fit: 'contain' })
    .png()
    .toFile(PLAY_STORE.out);

  console.log('✅ Launcher icons generated cleanly (1:1 from logo.png)');
}

async function splashCanvasBuffer(w, h) {
  return sharp({
    create: { width: w, height: h, channels: 4, background: SPLASH_BACKGROUND },
  }).png().toBuffer();
}

async function generateSplashSet(densityMap) {
  const iconBuffer = await sharp(SOURCE).toBuffer();
  for (const [density, { w, h }] of Object.entries(densityMap)) {
    for (const dirName of [`drawable-${density}`, `drawable-port-${density}`]) {
      const dir = path.join(RES_DIR, dirName);
      await ensureDir(dir);

      const background = await splashCanvasBuffer(w, h);
      const logoSize = Math.round(Math.min(w, h) * 0.55);
      const logo = await sharp(iconBuffer)
        .resize(logoSize, logoSize, { fit: 'contain' })
        .toBuffer();

      await sharp(background)
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toFile(path.join(dir, 'splash.png'));
    }
  }
}

async function generateSplashLandscape() {
  const iconBuffer = await sharp(SOURCE).toBuffer();
  for (const [density, { w, h }] of Object.entries(SPLASH_LANDSCAPE)) {
    const dir = path.join(RES_DIR, `drawable-land-${density}`);
    await ensureDir(dir);

    const background = await splashCanvasBuffer(w, h);
    const logoSize = Math.round(Math.min(w, h) * 0.55);
    const logo = await sharp(iconBuffer)
      .resize(logoSize, logoSize, { fit: 'contain' })
      .toBuffer();

    await sharp(background)
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'splash.png'));
  }
}

async function generateSplashIcon() {
  const iconBuffer = await sharp(SOURCE).toBuffer();
  const dir = path.join(RES_DIR, 'drawable');
  await ensureDir(dir);

  const canvas = 960;
  const safeZone = Math.round(canvas * 0.55);
  const logo = await sharp(iconBuffer)
    .resize(safeZone, safeZone, { fit: 'contain' })
    .toBuffer();

  const background = await splashCanvasBuffer(canvas, canvas);

  await sharp(background)
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'splash.png'));

  console.log('✅ Android 12+ splash icon generated (white background)');
}

async function generateSplash() {
  await generateSplashSet(SPLASH_PORTRAIT);
  await generateSplashLandscape();
  await generateSplashIcon();
  console.log('✅ Splash screens generated (white background)');
}

async function generateAdaptiveXml() {
  const anyDpiV26 = path.join(RES_DIR, 'mipmap-anydpi-v26');
  await ensureDir(anyDpiV26);

  const launcherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

  await writeFile(path.join(anyDpiV26, 'ic_launcher.xml'), launcherXml);
  await writeFile(path.join(anyDpiV26, 'ic_launcher_round.xml'), launcherXml);
  console.log('✅ Adaptive icon XML written');
}

async function main() {
  if (!existsSync(SOURCE)) {
    throw new Error(`Source icon not found: ${SOURCE}`);
  }
  await generateLauncherIcons();
  await generateSplash();
  await generateAdaptiveXml();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
