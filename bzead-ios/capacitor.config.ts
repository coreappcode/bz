import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the Bzead iOS buyer app.
 *
 * Mirrors bzead-android/capacitor.config.ts so both native shells behave
 * identically:
 *  - appId  com.bzead.buyerapp  (same applicationId as the Android app)
 *  - appName Bzead
 *  - webDir ../Bzeadstore-main/dist-buyer  (buyer-only web build)
 *  - SplashScreen: white background, logo centred, spinner in brand amber
 *  - StatusBar: dark style (light content) with no overlay — content starts
 *    below the status bar, exactly like the Android shell.
 *
 * iOS notes:
 *  - Capacitor 8 serves the web app from `capacitor://localhost` by default.
 *    The web app never exposes that origin to users (see src/config/baseUrl.ts).
 *  - Pull-to-refresh on iOS is handled in JS by the web app itself
 *    (nativeRuntime.tsx `useNativePullToRefresh` runs on `isNativeIOS`),
 *    so no native swipe-layout is required here.
 *  - OneSignal is initialised from JS (nativePushNotifications.ts) through
 *    onesignal-cordova-plugin — the same plugin dependency as Android.
 */
const config: CapacitorConfig = {
  appId: 'com.bzead.buyerapp',
  appName: 'Bzead',
  webDir: '../Bzeadstore-main/dist-buyer',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  server: {
    iosScheme: 'capacitor',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: true,
      spinnerColor: '#f59e0b',
      splashFullScreen: true,
      splashImmersive: false,
      // iOS-specific: fade the launch image out quickly to avoid a
      // double-splash flash once the WebView renders.
      launchFadeOutDuration: 300,
    },
    StatusBar: {
      // Style.DARK on iOS = UIStatusBarStyleLightContent (white icons/text),
      // matching Android's windowLightStatusBar=false with the #1e293b header.
      style: 'DARK',
      backgroundColor: '#1e293b',
      overlaysWebView: false,
    },
  },
};

export default config;
