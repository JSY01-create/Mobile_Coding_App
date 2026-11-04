import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.jsy01create.thumbcode",
  appName: "Thumbcode",
  webDir: "dist",
  backgroundColor: "#1c1c1e",
  plugins: {
    SystemBars: {
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
      // Light status bar icons on the dark app.
      style: "DARK",
    },
  },
};

export default config;
