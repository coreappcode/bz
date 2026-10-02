# bzead-ios — Capacitor iOS Buyer App

Capacitor **iOS** wrapper for the Bzead buyer web app — the exact iOS
counterpart of [`bzead-android/`](../bzead-android/). It consumes only the
**buyer** build of [`Bzeadstore-main/`](../Bzeadstore-main/) and ships it
inside a native iOS shell.

**It does not modify** `Bzeadstore-main/`, `bzead-android/`, or `BZEAD-iOS-main/`.

## Identity (mirrors the Android app)

| Item | Value |
|------|-------|
| Bundle ID | `com.bzead.buyerapp` |
| App name | `Bzead` |
| Version | `1.0.1` (build `2`) — same as the Play Store release |
| Web bundle | `../Bzeadstore-main/dist-buyer` (buyer-only Vite build) |
| Icon / splash | generated from repo-root [`logo.png`](../logo.png) |
| Orientation | portrait only (iPhone) |
| Push | OneSignal via `onesignal-cordova-plugin` (initialised from JS) |
| Min iOS | 15.0 (Capacitor 8 requirement) |
| Plugin integration | Swift Package Manager (Capacitor 8 default — no CocoaPods) |

## Native behaviour parity with Android

| Android behaviour | iOS equivalent |
|---|---|
| WebView locked between status/nav bars | Status bar light content, `overlaysWebView: false`, content starts below it |
| `android:screenOrientation="portrait"` | `UISupportedInterfaceOrientations = Portrait` (iPhone) |
| Native pull-to-refresh plugin | JS pull-to-refresh — the web app ships `useNativePullToRefresh` for `isNativeIOS` |
| `setTextZoom(100)` font lock | not needed (iOS doesn't scale WebView text) |
| Third-party cookies for Stripe 3DS | WKWebView allows Stripe's challenge iframes by default |
| OneSignal initialised in `MainActivity` | OneSignal initialised from JS (`nativePushNotifications.ts`) — same plugin |
| App Links `https://bzead.com` | Universal Links require an Apple Team ID + AASA file — see SETUP.md §7 |
| Geolocation permission | `NSLocationWhenInUseUsageDescription` in Info.plist |
| Photo picker (no permissions) | `<input type=file>` uses the system picker — no permissions needed |

## Project layout

```text
bzead-ios/
├── capacitor.config.ts        # mirrors bzead-android's config
├── package.json               # Capacitor 8 + same plugin set as Android
├── scripts/
│   ├── build-ios.mjs          # web build → sync → xcodebuild (sim/device)
│   ├── generate-ios-assets.mjs# AppIcon + Splash from logo.png
│   └── prepare-assets.mjs     # strips non-shippable files from dist-buyer
└── ios/                       # native Xcode project (SPM-based)
    ├── App/App.xcodeproj
    ├── App/CapApp-SPM/        # local SPM package wiring all plugins
    └── App/App/
        ├── Info.plist         # portrait, location usage, background modes
        ├── Assets.xcassets/   # AppIcon + Splash (generated)
        └── public/            # synced buyer web bundle (gitignored)
```

## Quick start

```bash
# 0. One-time: configure the web app env
cd Bzeadstore-main && cp .env.example .env   # fill in real public keys

# 1. Build the web bundle and open Xcode
cd ../bzead-ios
npm install
npm run build:web
npx cap sync ios
npm run open:ios      # opens Xcode; pick your Team, then ⌘R to run
```

Full build instructions (including generating debug artifacts **without
opening Xcode**, and CI) → [`SETUP.md`](SETUP.md).
