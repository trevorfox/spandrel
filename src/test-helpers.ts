import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function createTempDir(prefix = "spandrel-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  return Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => {
          if (typeof item === "object") {
            const entries = Object.entries(item as Record<string, unknown>)
              .map(([ik, iv]) => `    ${ik}: ${JSON.stringify(iv)}`)
              .join("\n");
            return `  -\n${entries}`;
          }
          return `  - ${JSON.stringify(item)}`;
        }).join("\n")}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("\n");
}

export function writeIndex(
  dir: string,
  frontmatter: Record<string, unknown>,
  content = ""
) {
  fs.mkdirSync(dir, { recursive: true });
  const fm = serializeFrontmatter(frontmatter);
  fs.writeFileSync(
    path.join(dir, "index.md"),
    `---\n${fm}\n---\n\n${content}\n`
  );
}

export function writeLeafMd(
  parentDir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  content = ""
) {
  fs.mkdirSync(parentDir, { recursive: true });
  const fm = serializeFrontmatter(frontmatter);
  const name = filename.endsWith(".md") ? filename : filename + ".md";
  fs.writeFileSync(
    path.join(parentDir, name),
    `---\n${fm}\n---\n\n${content}\n`
  );
}
