import { expect, test, type Page, type Route } from "@playwright/test";

const cover = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c46"/></svg>');
const track = (id: number, artist = `Artist ${id}`) => ({ id: String(id), provider: "deezer", title: `Song ${id}`, artist, album: `Album ${id}`, image: cover, url: `https://www.deezer.com/track/${id}`, duration: 200, reason: "Seed 的关联艺人 · 同属「独立」" });
const seed = { ...track(1, "Seed Artist"), title: "Seed Song" };
const fourteen = Array.from({ length: 14 }, (_, i) => track(100 + i));
const progress = (scored: number, total = 600) => ({ scoredCount: scored, totalCount: total, completedBatches: 0, totalBatches: 5, elapsedMs: 1000 });
const JOB = "11111111-1111-4111-8111-111111111111";

type Api = { recommendBodies: unknown[]; steps: number; cancels: number; polls: number };
async function mockApi(page: Page, options: { driver?: "server" | "client" } = {}): Promise<Api> {
 const api: Api = { recommendBodies: [], steps: 0, cancels: 0, polls: 0 };
 const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
 await page.route("**/api/**", async route => {
  const url = new URL(route.request().url()), path = url.pathname;
  if (path === "/api/library") return json(route, { tracks: 145548, artists: 6965, previewable: 145536, candidateLimit: 600, recallPool: 5000, available: true, byokAvailable: true, quota: { siteDaily: 100, personalDaily: 30, ipDaily: 20 }, turnstileSiteKey: null });
  if (path === "/api/music" && url.searchParams.get("q")) return json(route, { tracks: [seed, track(2)] });
  if (path === "/api/music") return json(route, { track: { ...track(Number(url.searchParams.get("id"))), preview: undefined } });
  if (path === "/api/recommend") { api.recommendBodies.push(route.request().postDataJSON()); return json(route, { jobId: JOB, status: "pending", nextStep: 0, totalSteps: 2, progress: progress(0), driver: options.driver || "client" }, 201); }
  if (path === `/api/jobs/${JOB}/step`) { api.steps++; return json(route, api.steps < 2 ? { jobId: JOB, status: "pending", nextStep: api.steps, progress: progress(300) } : { jobId: JOB, status: "done", nextStep: 2, progress: progress(600), tracks: fourteen, meta: { candidateCount: 600, wallMs: 4200, model: "jev-test", recall: { prerankPool: 4800 } } }); }
  if (path === `/api/jobs/${JOB}/cancel`) { api.cancels++; return json(route, { jobId: JOB, status: "cancelled" }); }
  if (path === `/api/jobs/${JOB}`) { api.polls++; return json(route, api.polls < 2 ? { jobId: JOB, status: "running", nextStep: 0, progress: progress(300), retryAfterMs: 100 } : { jobId: JOB, status: "done", nextStep: 2, progress: progress(600), tracks: fourteen, meta: { candidateCount: 600, wallMs: 3000, model: "jev-test" } }); }
  return json(route, { error: "unexpected" }, 404);
 });
 return api;
}
async function chooseSeed(page: Page) {
 await page.getByRole("searchbox").or(page.getByPlaceholder("输入喜欢的歌或歌手…")).first().fill("Seed");
 await page.getByRole("button", { name: /^找歌/ }).click();
 await page.locator(".results li").first().getByRole("button", { name: /从这首出发/ }).click();
 await expect(page.locator(".seed-chip")).toContainText("Seed Song");
}

test("featured seven, hero focus and listening platforms render", async ({ page }) => {
 await mockApi(page);
 await page.goto("./");
 await expect(page.locator(".hero-title")).toHaveText("Show Me How");
 await expect(page.locator(".rail-track").first().locator(".record")).toHaveCount(7);
 await page.locator(".record-text").nth(4).click();
 await expect(page.locator(".hero-title")).toHaveText("Weird Fishes / Arpeggi");
 await expect(page.locator(".listen-grid .listen-tile")).toHaveCount(6);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("client-driven round: search, seed, steps, results, structured dismiss and save", async ({ page }) => {
 const api = await mockApi(page);
 await page.goto("./");
 await chooseSeed(page);
 await page.getByRole("radio", { name: "换个角度" }).click();
 await page.getByRole("button", { name: /寻找我的七首/ }).click();
 await expect(page.locator(".hero-title")).toHaveText("Song 100");
 expect(api.steps).toBe(2);
 await expect(page.locator(".rail-track").first().locator(".record")).toHaveCount(7);
 const body = api.recommendBodies[0] as { direction: string; seed: { id: string } };
 expect(body.direction).toBe("sideways");
 expect(body.seed.id).toBe("1");

 // Dismiss with "not this artist": the next request must carry the artist as avoided.
 await page.getByRole("button", { name: /不太合适/ }).first().click();
 await page.getByRole("button", { name: /不喜欢这位歌手/ }).click();
 await expect(page.locator(".toast")).toContainText("下一轮");
 await page.locator(".record .cover-heart").first().click();
 await expect(page.locator(".nav-pill .badge")).toHaveText("1");

 await page.getByRole("button", { name: /再听七首/ }).click();
 await expect(page.locator(".rail-track").first().locator(".record")).toHaveCount(6);
 api.steps = 0;
 await page.getByRole("button", { name: /寻找新一轮/ }).click();
 await expect.poll(() => api.recommendBodies.length).toBe(2);
 const second = api.recommendBodies[1] as { avoidArtists: string[]; feedback: { disliked: string[] }; excluded: string[] };
 expect(second.avoidArtists).toEqual(["Artist 100"]);
 expect(second.feedback.disliked[0]).toContain("不喜欢这位歌手");
 expect(second.excluded).toContain("deezer:100");
});

test("server-driven round only polls and never posts steps", async ({ page }) => {
 const api = await mockApi(page, { driver: "server" });
 await page.goto("./");
 await chooseSeed(page);
 await page.getByRole("button", { name: /寻找我的七首/ }).click();
 await expect(page.locator(".hero-title")).toHaveText("Song 100");
 expect(api.steps).toBe(0);
 expect(api.polls).toBeGreaterThanOrEqual(2);
});

test("saved view exports a backup and share links open the shared seven", async ({ page, context }) => {
 await mockApi(page);
 await page.goto("./");
 await page.locator(".record .cover-heart").first().click();
 await page.locator(".nav-pill").getByRole("button", { name: /收藏/ }).click();
 await expect(page.locator(".saved-card")).toHaveCount(1);
 const download = page.waitForEvent("download");
 await page.getByRole("button", { name: /备份 JSON/ }).click();
 const file = await download;
 expect(file.suggestedFilename()).toMatch(/^aftertone-backup-.*\.json$/);

 const shared = await context.newPage();
 await mockApi(shared);
 await shared.goto("./#share=deezer:301,deezer:302,deezer:303");
 await expect(shared.locator(".rail-head h2").first()).toContainText("朋友分享的七首");
 await expect(shared.locator(".rail-track").first().locator(".record")).toHaveCount(3);
});

test("language and theme switches persist", async ({ page }) => {
 await mockApi(page);
 await page.goto("./");
 await page.getByRole("button", { name: "Switch to English" }).click();
 await expect(page.locator(".eyebrow")).toContainText(/START WITH THESE SEVEN/i);
 await page.getByRole("button", { name: "Switch to light" }).click();
 await page.reload();
 await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
 await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("reopening the page picks up a server-driven round that was still running", async ({ page }) => {
 const api = await mockApi(page, { driver: "server" });
 await page.addInitScript(([job, s]) => localStorage.setItem("aftertone-active-job", JSON.stringify({ jobId: job, seed: s, startedAt: Date.now(), personal: false })), [JOB, seed] as const);
 await page.goto("./");
 await expect(page.locator(".hero-title")).toHaveText("Song 100");
 await expect(page.locator(".seed-chip")).toContainText("Seed Song");
 expect(api.steps).toBe(0);
 expect(await page.evaluate(() => localStorage.getItem("aftertone-active-job"))).toBeNull();
});

test("playing from the saved rail previews without replacing the current round", async ({ page }) => {
 await mockApi(page);
 await page.goto("./");
 await page.locator(".record .cover-heart").first().click();
 const savedRail = page.locator(".rail-track").nth(1);
 await savedRail.locator(".cover-hit").first().click();
 await expect(page.locator(".seed-chip")).toHaveCount(0);
 await savedRail.locator(".record-text").first().click();
 await expect(page.locator(".seed-chip")).toContainText("Show Me How");
});
