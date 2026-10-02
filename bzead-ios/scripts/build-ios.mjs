#!/usr/bin/env node
/**
 * End-to-end build script for the Bzead buyer iOS app.
 * (1:1 with bzead-android/scripts/build-android.mjs)
 *
 * 1. Builds the buyer-only web app (Bzeadstore-main `npm run build:buyer`).
 * 2. Strips files that must not ship inside the app bundle.
 * 3. Syncs web assets + Capacitor plugins into the iOS project.
 * 4. Produces a Debug .app (iOS Simulator), a Debug .ipa (device, unsigned),
 *    or both — depending on the requested target.
 *
 * Usage:
 *   node scripts/build-ios.mjs simulator   # → bzead-ios-simulator-debug.zip
 *   node scripts/build-ios.mjs device      # → bzead-ios-device-debug-unsigned.ipa
 *   node scripts/build-ios.mjs debug       # both (default)
 *
 * Requirements (macOS only): Xcode 16+, CocoaPods, Node 20+.
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_APP_DIR = path.resolve(ROOT, '../Bzeadstore-main');
const IOS_DIR = path.join(ROOT, 'ios');
const WORKSPACE = path.join(IOS_DIR, 'App/App.xcworkspace');
const SCHEME = 'App';
const OUTPUT_DIR = path.join(IOS_DIR, 'App/output');
const ARCHIVE_DIR = path.join(OUTPUT_DIR, 'archive');
const SIM_DIR = path.join(OUTPUT_DIR, 'simulator');
const DEVICE_DIR = path.join(OUTPUT_DIR, 'device');

const SIMULATOR_ZIP = path.join(OUTPUT_DIR, 'bzead-ios-simulator-debug.zip');
const DEVICE_IPA = path.join(OUTPUT_DIR, 'bzead-ios-device-debug-unsigned.ipa');

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function checkXcode() {
  if (process.platform !== 'darwin') {
    console.error('\n❌ iOS builds require macOS with Xcode 16+ installed.');
    console.error('   On Linux, use the GitHub Actions workflow:');
    console.error('   .github/workflows/ios-capacitor-debug.yml (Actions → Run workflow)');
    process.exit(1);
  }
  try {
    execSync('xcodebuild -version', { stdio: 'pipe' });
  } catch {
    console.error('\n❌ xcodebuild not found. Install Xcode and run:');
    console.error('   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
    process.exit(1);
  }
}

function clean() {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  for (const dir of [SIM_DIR, DEVICE_DIR, ARCHIVE_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

function buildWebAndSync() {
  if (!existsSync(WEB_APP_DIR)) {
    throw new Error(`Web app directory not found: ${WEB_APP_DIR}`);
  }

  // 1. Build buyer web app
  run('npm run build:buyer', WEB_APP_DIR);

  // 1b. Strip files that should not ship inside the app bundle
  run('node scripts/prepare-assets.mjs', ROOT);

  const distBuyer = path.join(WEB_APP_DIR, 'dist-buyer');
  if (!existsSync(distBuyer)) {
    throw new Error(`Buyer build output missing: ${distBuyer}`);
  }

  // 2. Sync into the iOS project (also runs `pod install` on macOS)
  run('npx cap sync ios', ROOT);
}

function buildSimulator() {
  console.log('\n📦 Building Debug .app for iOS Simulator...');
  run(
    `xcodebuild -workspace ${WORKSPACE} -scheme ${SCHEME} -configuration Debug ` +
      `-sdk iphonesimulator -destination 'generic/platform=iOS Simulator' ` +
      `-derivedDataPath ${SIM_DIR} CODE_SIGNING_ALLOWED=NO build`,
    IOS_DIR
  );

  const appPath = findFirst(SIM_DIR, '.app');
  if (!appPath) throw new Error('Simulator .app not found after build');

  console.log('\n📦 Zipping simulator app for distribution...');
  // Payload/ layout lets the zip be dragged straight onto a Simulator window
  const payloadDir = path.join(SIM_DIR, 'Payload');
  mkdirSync(payloadDir, { recursive: true });
  copyFileSync(appPath, path.join(payloadDir, path.basename(appPath)));
  execSync(`cd "${SIM_DIR}" && zip -qry "${SIMULATOR_ZIP}" Payload`, { stdio: 'inherit' });

  console.log(`\n✅ Simulator debug app: ${SIMULATOR_ZIP}`);
  console.log('   Test: open Simulator.app, then drag the .zip (or the .app) onto it.');
}

function buildDevice() {
  console.log('\n📦 Building Debug .ipa for device (unsigned)...');
  run(
    `xcodebuild -workspace ${WORKSPACE} -scheme ${SCHEME} -configuration Debug ` +
      `-sdk iphoneos -destination 'generic/platform=iOS' ` +
      `-archivePath ${ARCHIVE_DIR}/App.xcarchive archive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`,
    IOS_DIR
  );

  // Wrap the device .app in a Payload/.ipa shell (unsigned — sign it with
  // Sideloadly / Apple Configurator / Xcode before installing).
  const appPath = findFirst(path.join(ARCHIVE_DIR, 'Products/Applications'), '.app');
  if (!appPath) throw new Error('Device .app not found after archive');

  const payloadDir = path.join(DEVICE_DIR, 'Payload');
  mkdirSync(payloadDir, { recursive: true });
  execSync(`cp -R "${appPath}" "${payloadDir}/"`, { stdio: 'inherit' });
  execSync(`cd "${DEVICE_DIR}" && zip -qry "${DEVICE_IPA}" Payload`, { stdio: 'inherit' });

  console.log(`\n✅ Device debug .ipa (unsigned): ${DEVICE_IPA}`);
  console.log('   Unsigned — sign it with a free Apple ID via Sideloadly/AltStore,');
  console.log('   or open ios/App/App.xcodeproj in Xcode and run directly to your device.');
}

function findFirst(rootDir, suffix) {
  if (!existsSync(rootDir)) return null;
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift();
    for (const entry of execSync(`find "${dir}" -maxdepth 1`, { encoding: 'utf8' }).split('\n')) {
      if (!entry || entry === dir) continue;
      if (entry.endsWith(suffix)) return entry;
      try {
        if (statSync(entry).isDirectory()) queue.push(entry);
      } catch { /* ignore */ }
    }
  }
  return null;
}

function main() {
  const target = process.argv[2] || 'debug';

  checkXcode();
  clean();
  buildWebAndSync();

  if (target === 'simulator') {
    buildSimulator();
  } else if (target === 'device') {
    buildDevice();
  } else {
    buildSimulator();
    buildDevice();
  }

  console.log('\n🎉 Done. Build outputs in ios/App/output/');
}

main();
