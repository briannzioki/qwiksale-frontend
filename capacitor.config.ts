import type { CapacitorConfig } from "@capacitor/cli";

const SERVER_URL =
  process.env.CAP_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://qwiksale.sale";

const config: CapacitorConfig = {
  appId: "com.qwiksale.app",
  appName: "QwikSale",

  // must exist and contain index.html (even if you're loading a remote url)
  webDir: "cap-web",

  server: {
    url: SERVER_URL,
    cleartext: SERVER_URL.startsWith("http://"),
    androidScheme: "https",
    allowNavigation: ["qwiksale.sale", "*.qwiksale.sale"],
  },

  plugins: {
    Keyboard: { resize: "body", resizeOnFullScreen: true },
    StatusBar: { overlaysWebView: false, style: "DARK" },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0b1020",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
  },
};

export default config;
