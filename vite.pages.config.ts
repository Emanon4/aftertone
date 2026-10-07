import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { copyFile, mkdir } from "node:fs/promises";

// The front end only ships web/public; the catalog under public/ belongs to the API's asset binding.
export default defineConfig({
 plugins: [react(), {
  name: "legal-notices",
  async closeBundle() {
   await mkdir("dist-pages/legal", { recursive: true });
   await Promise.all([
    copyFile("LICENSE", "dist-pages/legal/LICENSE.txt"),
    copyFile("THIRD_PARTY_NOTICES.md", "dist-pages/legal/THIRD_PARTY_NOTICES.md"),
   ]);
  },
 }],
 base: process.env.PAGES_BASE_PATH || "/aftertone/",
 publicDir: "web/public",
 resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
 build: { outDir: "dist-pages", emptyOutDir: true },
 server: { host: "127.0.0.1", port: 5176, proxy: { "/api": { target: "http://127.0.0.1:8788", changeOrigin: true } } },
});
