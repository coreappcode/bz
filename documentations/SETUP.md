# bzead-ios — Setup & Debug Build Guide

## Requirements

- **macOS** with **Xcode 16+** (`xcodebuild -version` should work)
- **Node.js 20+**
- Swift Package Manager (built into Xcode — no CocoaPods needed)
- For real-device installs: a free or paid **Apple ID** (added in Xcode)

No Mac? Use the CI pipeline — see §6.

---

## 1. Configure the web app environment

The iOS app embeds the buyer web build, which needs real public keys:

```bash
cd Bzeadstore-main
cp .env.example .env
# Fill in:
#   VITE_SUPABASE_URL            (already real in .env.example)
#   VITE_SUPABASE_ANON_KEY       ← required
#   VITE_STRIPE_PUBLISHABLE_KEY  ← required
#   VITE_ONESIGNAL_APP_ID        (already real in .env.example)
#   VITE_DOMAIN / VITE_PUBLIC_APP_URL = https://www.bzead.com
```

## 2. Build + sync

```bash
cd bzead-ios
npm install
npm run build:web      # builds Bzeadstore-main → dist-buyer, strips junk
npx cap sync ios       # copies web assets + registers SPM plugins
```

## 3. Run in Simulator / on a device (Xcode)

```bash
npm run open:ios
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → tick
   *Automatically manage signing* and choose your **Team**
   (a free Apple ID works: Xcode → Settings → Accounts).
2. Pick an iOS Simulator (iPhone 15/16) → **⌘R** to run, **or** select your
   iPhone and run (first time: trust the developer cert on the phone under
   *Settings → General → VPN & Device Management*).

## 4. Build debug artifacts from the CLI (no Xcode UI)

```bash
cd bzead-ios
npm run build:debug        # both outputs below
# or individually:
npm run build:simulator    # ios/App/output/bzead-ios-simulator-debug.zip
npm run build:device       # ios/App/output/bzead-ios-device-debug-unsigned.ipa
```

- **Simulator zip** → open *Simulator.app* and drag the zip onto the window.
- **Unsigned device .ipa** → sign with a free Apple ID using
  [Sideloadly](https://sideloadly.io/) or AltStore, then install (valid 7
  days; 3-app limit on free accounts). For a permanent TestFlight/App Store
  build you'll need the paid Apple Developer account — see §8.

## 5. Regenerate branding assets (after changing logo.png)

```bash
npm run assets            # rewrites AppIcon + Splash from repo-root logo.png
npx cap sync ios
```

## 6. CI — debug builds without a Mac

**.github/workflows/ios-capacitor-debug.yml** runs on `push` (paths
`bzead-ios/**`, `Bzeadstore-main/**`) and on manual dispatch. It needs these
repo **Secrets** (the same ones the native iOS workflow already uses):

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | baked into the web bundle |
| `SUPABASE_ANON_KEY` | baked into the web bundle |
| `PUBLIC_APP_URL` | `https://www.bzead.com` |
| `STRIPE_PUBLISHABLE_KEY` | payments in the embedded bundle |
| `ONESIGNAL_APP_ID` | push notifications |

Artifacts produced per run (Actions → run → *Artifacts*):

- `bzead-ios-simulator-debug` — drag onto Simulator
- `bzead-ios-device-debug-ipa` — unsigned; sign via Sideloadly/AltStore

## 7. Push notifications on iOS (one-time dashboard work)

Android's OneSignal app already exists; **add the iOS platform** to the same
OneSignal app:

1. OneSignal Dashboard → *Settings → Platforms → Apple iOS*.
2. Upload an **APNs Auth Key** (.p8) from your Apple Developer account
   (free accounts cannot generate APNs keys — push needs the paid account).
3. Keep the same OneSignal App ID — `VITE_ONESIGNAL_APP_ID` already points at
   it, so the embedded web bundle works unchanged.

Without the APNs key the app still runs; only remote push delivery is
disabled.

## 8. Release path (after debug testing)

1. Paid Apple Developer Program membership.
2. Xcode → target → Signing: select the distribution team.
3. Register the bundle ID `com.bzead.buyerapp` in the developer portal.
4. Add **Associated Domains** (`applinks:bzead.com`, `applinks:www.bzead.com`)
   + host the AASA file at `https://bzead.com/.well-known/apple-app-site-association`
   — this is the iOS counterpart of Android's App Links for Stripe
   `return_url` hand-back.
5. `Product → Archive → Distribute` (or a CI lane) → TestFlight.

## 9. Known debug-build limitations

| Area | Status in debug | Notes |
|---|---|---|
| Stripe 3DS | works inline | challenge renders in the WebView; no popup needed on iOS |
| Universal Links | not active | needs Team ID + AASA (§8.4); debug uses in-WebView navigation |
| OneSignal push | requires APNs key | §7; app runs fine without it |
| Device install of unsigned .ipa | needs re-signing | Sideloadly/AltStore with free Apple ID (§4) |

## 10. Maintenance

Every web update: `npm run build:web && npx cap sync ios`, then rebuild.
Plugin changes: edit `package.json` → `npm install` → `npx cap sync ios`
(the CLI updates `App/CapApp-SPM/Package.swift` automatically).

Do **not** modify `Bzeadstore-main/`, `bzead-android/`, or `BZEAD-iOS-main/`
from this project.
