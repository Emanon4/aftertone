// Upload the catalog index to R2 so it no longer has to ship as Worker static assets.
// Usage: npm run catalog:upload -- [bucket-name] [catalog-dir]
// Then uncomment the CATALOG r2_buckets binding in wrangler.api.jsonc and deploy the API.
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const bucket = process.argv[2] || "aftertone-catalog";
const dir = process.argv[3] || "public/catalog";
const files = (await readdir(dir)).filter(name => /^[a-z0-9-]+\.json$/.test(name)).sort();
if (!files.includes("manifest.json") || !files.includes("artists.json")) throw new Error(`${dir} must contain manifest.json and artists.json`);
// Shards first, manifest last: readers never see a manifest that points at missing shards.
const ordered = [...files.filter(f => f !== "manifest.json"), "manifest.json"];
for (const [i, name] of ordered.entries()) {
 const result = spawnSync("npx", ["wrangler", "r2", "object", "put", `${bucket}/catalog/${name}`, "--file", path.join(dir, name), "--content-type", "application/json", "--remote"], { stdio: ["ignore", "ignore", "inherit"] });
 if (result.status !== 0) throw new Error(`upload failed at ${name}`);
 console.log(`[${i + 1}/${ordered.length}] catalog/${name}`);
}
