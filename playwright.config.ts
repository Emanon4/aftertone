import { defineConfig, devices } from "@playwright/test";

// The API is mocked per test with page.route, so only the Vite dev server is needed.
// Locally set PW_CHANNEL=chrome to reuse an installed Chrome instead of downloading Chromium.
const channel = process.env.PW_CHANNEL;
export default defineConfig({
 testDir: "e2e",
 timeout: 30_000,
 retries: process.env.CI ? 1 : 0,
 reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
 use: { baseURL: "http://127.0.0.1:5176/aftertone/", locale: "zh-CN", trace: "retain-on-failure", ...(channel ? { channel } : {}) },
 projects: [
  { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...(channel ? { channel } : {}) } },
  { name: "phone", use: { ...devices["Pixel 7"], ...(channel ? { channel } : {}) } },
 ],
 webServer: { command: "npm run dev", url: "http://127.0.0.1:5176/aftertone/", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
