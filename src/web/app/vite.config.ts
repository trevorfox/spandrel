import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Keep assets relative so the publish step can rewrite <base href> without
// rebuilding. The browser resolves graph.json and all hashed assets against
// document.baseURI.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  build: {
    outDir: resolve(here, "../../../dist/web"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      // Dev-mode proxy to the spandrel dev server running on :4000. Makes
      // graph.json and /events work when running `vite dev` standalone.
      "/graph.json": "http://localhost:4000",
      "/events": { target: "http://localhost:4000", ws: false },
      "/graphql": "http://localhost:4000",
    },
  },
});
