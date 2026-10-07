// Visual check: render the running dev server at desktop and phone sizes.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]   (uses the locally installed Chrome)
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://127.0.0.1:5176/aftertone/";
const out = process.argv[3] || "output/screens";
const browser = await chromium.launch({ channel: "chrome" });
const shots = [
 { name: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark", full: true },
 { name: "desktop-light", viewport: { width: 1440, height: 900 }, theme: "light", full: true },
 { name: "phone-dark", viewport: { width: 390, height: 844 }, theme: "dark", mobile: true, full: true },
 { name: "phone-light", viewport: { width: 390, height: 844 }, theme: "light", mobile: true, full: true },
];
for (const shot of shots) {
 const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2, isMobile: !!shot.mobile, hasTouch: !!shot.mobile, locale: process.env.SHOT_LOCALE || "zh-CN", reducedMotion: "reduce" });
 await context.addInitScript(theme => localStorage.setItem("aftertone-theme", theme), shot.theme);
 const page = await context.newPage();
 await page.goto(base, { waitUntil: "networkidle" });
 await page.waitForTimeout(800);
 // Grow the viewport to the page height instead of fullPage, so fixed layers (the ambient glow) cover everything.
 if (shot.full) await page.setViewportSize({ width: shot.viewport.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
 await page.waitForTimeout(300);
 await page.screenshot({ path: `${out}/${shot.name}.png` });
 await context.close();
}
await browser.close();
console.log(`saved to ${out}`);
