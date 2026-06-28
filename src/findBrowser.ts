import { existsSync } from "fs";
import * as os from "os";
import { join } from "path";

/**
 * Puppeteer's bundled Chromium is frequently absent (never downloaded), which breaks every
 * browser-based search/scrape provider (H1). Detect a system Chrome/Edge/Chromium and pass its
 * executablePath to puppeteer.launch instead. Pure candidate list (testable) + an existsSync probe.
 */
export function browserCandidatePaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  if (platform === "win32") {
    const pf = env["PROGRAMFILES"] || "C:\\Program Files";
    const pf86 = env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const local = env["LOCALAPPDATA"] || join(home, "AppData", "Local");
    return [
      join(pf, "Google\\Chrome\\Application\\chrome.exe"),
      join(pf86, "Google\\Chrome\\Application\\chrome.exe"),
      join(local, "Google\\Chrome\\Application\\chrome.exe"),
      join(pf86, "Microsoft\\Edge\\Application\\msedge.exe"),
      join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
    ];
  }
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
}

/** First existing system browser executable, or undefined (then puppeteer falls back to its bundled one). */
export function findSystemBrowserPath(): string | undefined {
  return browserCandidatePaths(process.platform, process.env, os.homedir()).find(p => existsSync(p));
}
