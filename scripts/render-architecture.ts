// Renders the README Architecture diagram to assets/architecture.png.
// Run: npm run render:diagrams

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const c = {
  bg: "#f4efe6",
  bgElevated: "#ede7db",
  fg: "#2a2825",
  fgMuted: "#6a6559",
  accent: "#a67c3c",
  rule: "#d6cdb9",
  ruleStrong: "#b8ae96",
  codeBg: "#1e1c19",
  codeFg: "#ebe3d4",
};

const tree = `my-graph/
├── index.md
├── customers/
│   ├── acme.md
│   └── globex.md
├── projects/
│   ├── q4-launch.md
│   └── data-migration.md
├── playbooks/
│   ├── incident-response.md
│   └── new-customer.md
├── _links/config.yaml
└── _access/config.yaml`;

const columnStyle = `display:flex; flex-direction:column; flex:1; background:${c.bgElevated}; border:1px solid ${c.ruleStrong}; border-radius:6px; padding:22px;`;
const labelStyle = `display:flex; flex-shrink:0; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:${c.fgMuted}; margin-bottom:16px; font-family:'Source Serif 4'; font-weight:600;`;
const stackStyle = `display:flex; flex-direction:column; flex:1; gap:10px;`;
const itemStyle = `display:flex; flex:1; align-items:center; background:${c.bg}; border:1px solid ${c.rule}; padding:0 16px; border-radius:4px; color:${c.fg}; font-size:16px; font-family:'Source Serif 4';`;
const itemAccentStyle = itemStyle.replace(c.rule, c.accent);
const arrowCol = `display:flex; align-items:center; justify-content:center; padding:0 14px; color:${c.fgMuted}; font-size:28px; font-family:'JetBrains Mono';`;
const vArrow = `display:flex; flex-shrink:0; justify-content:center; color:${c.fgMuted}; font-size:14px; font-family:'JetBrains Mono'; line-height:1; margin:2px 0;`;

const markup = html`<div style="display:flex; flex-direction:column; width:1500px; height:560px; background:${c.bg}; padding:36px; font-family:'Source Serif 4';">
  <div style="display:flex; flex:1; align-items:stretch;">
    <div style="${columnStyle}">
      <div style="${labelStyle}">Markdown tree</div>
      <div style="display:flex; flex:1; background:${c.codeBg}; border-radius:5px; padding:18px 20px; font-family:'JetBrains Mono'; font-size:15px; color:${c.codeFg}; line-height:1.65; white-space:pre;">${tree}</div>
    </div>
    <div style="${arrowCol}">→</div>
    <div style="${columnStyle}">
      <div style="${labelStyle}">Spandrel runtime</div>
      <div style="${stackStyle}">
        <div style="${itemStyle}">Compiler</div>
        <div style="${vArrow}">↓</div>
        <div style="${itemStyle}">GraphStore</div>
        <div style="${vArrow}">↓</div>
        <div style="${itemAccentStyle}">AccessPolicy</div>
      </div>
    </div>
    <div style="${arrowCol}">→</div>
    <div style="${columnStyle}">
      <div style="${labelStyle}">Wire surfaces</div>
      <div style="${stackStyle}">
        <div style="${itemStyle} justify-content:center;">MCP</div>
        <div style="${itemStyle} justify-content:center;">REST</div>
      </div>
    </div>
    <div style="${arrowCol}">→</div>
    <div style="${columnStyle}">
      <div style="${labelStyle}">Consumers</div>
      <div style="${stackStyle}">
        <div style="${itemStyle}">Claude Code</div>
        <div style="${itemStyle}">Browser viewer</div>
        <div style="${itemStyle}">HTTP / SDK clients</div>
      </div>
    </div>
  </div>
</div>`;

async function loadOrFetch(localPath: string, url: string): Promise<Buffer> {
  try {
    return await readFile(localPath);
  } catch {
    console.log(`Fetching ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, buf);
    return buf;
  }
}

async function main() {
  const serif400 = await readFile(
    path.join(
      root,
      "node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff",
    ),
  );
  const serif600 = await readFile(
    path.join(
      root,
      "node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff",
    ),
  );
  const mono400 = await loadOrFetch(
    path.join(root, "scripts/fonts/JetBrainsMono-Regular.ttf"),
    "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf",
  );

  const svg = await satori(markup, {
    width: 1500,
    height: 560,
    fonts: [
      { name: "Source Serif 4", data: serif400, weight: 400, style: "normal" },
      { name: "Source Serif 4", data: serif600, weight: 600, style: "normal" },
      { name: "JetBrains Mono", data: mono400, weight: 400, style: "normal" },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: 3000 } })
    .render()
    .asPng();

  const outPath = path.join(root, "assets/architecture.png");
  await writeFile(outPath, png);
  console.log(`Wrote ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
