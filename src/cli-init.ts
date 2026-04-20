import fs from "node:fs";
import path from "node:path";

export interface InitOptions {
  name: string;
  description: string;
}

export interface InitResult {
  filesWritten: string[];
  alreadyInitialized: boolean;
}

/**
 * Baseline link-type vocabulary seeded into every new Spandrel graph.
 * Ordered by rough semantic weight — structural types first, semantic
 * reference types in the middle, authored_by and the catchall last.
 * Descriptions lean on contrast: each draws a line against its nearest
 * neighbor so an agent can disambiguate "owns vs part-of",
 * "derived-from vs cites", etc.
 */
export const BASELINE_LINK_TYPES: Array<{ stem: string; name: string; description: string }> = [
  {
    stem: "owns",
    name: "owns",
    description:
      "The source has operational, legal, or editorial control of the target. Use for account ownership, stewardship, or responsibility — situations where the source can change, retire, or reassign the target. Prefer this over `part-of` when the relationship is about authority rather than composition.",
  },
  {
    stem: "depends-on",
    name: "depends-on",
    description:
      "The source cannot function, ship, or be understood without the target. Use for hard technical, procedural, or logical prerequisites — if the target breaks or is removed, the source is affected. Contrast with `relates-to`, which implies only thematic adjacency, and with `mentions`, which is a passing reference.",
  },
  {
    stem: "part-of",
    name: "part-of",
    description:
      "The source is a constituent piece of a larger whole named by the target. Use for composition and membership (a module of a system, a chapter of a book, a person on a team). Prefer `part-of` when the source only exists meaningfully in the context of the target; prefer `owns` when the emphasis is on authority, not structure.",
  },
  {
    stem: "mentions",
    name: "mentions",
    description:
      "The source makes a passing reference to the target somewhere in its prose. This is the default link type the compiler emits for inline markdown links and carries no claim of dependency or authority. Use it when the reference is incidental; promote to a typed frontmatter link when the relationship is load-bearing.",
  },
  {
    stem: "supersedes",
    name: "supersedes",
    description:
      "The source replaces the target as the current authoritative version. Use when a newer document, decision, or artifact makes the older one historical — readers should prefer the source over the target going forward. Contrast with `derived-from`, which implies lineage without obsolescence.",
  },
  {
    stem: "derived-from",
    name: "derived-from",
    description:
      "The source was produced by transforming, extracting, or building on the target. Use for outputs generated from inputs — summaries, forks, compiled artifacts, analyses. Contrast with `cites`, which marks an external reference used as evidence, and with `supersedes`, which implies the source replaces the target.",
  },
  {
    stem: "cites",
    name: "cites",
    description:
      "The source references the target as evidence, source material, or prior art. Use for bibliographic or attributive links — papers, standards, external documents the source relies on without being derived from them. Contrast with `derived-from`, which implies the source was materially produced from the target.",
  },
  {
    stem: "instance-of",
    name: "instance-of",
    description:
      "The source is a concrete instance or realization of the category, pattern, or type described by the target. Use to connect individuals to their class (this meeting → weekly standup template, this service → microservice pattern). Contrast with `part-of`, which is about composition rather than classification.",
  },
  {
    stem: "authored-by",
    name: "authored-by",
    description:
      "The target is the person or team responsible for creating the source. Use to attribute documents, decisions, or artifacts to their authors. The compiler also emits an `authored_by` edge automatically from the `author` frontmatter field; this declared type covers cases where authorship is expressed as a link rather than a single-author field.",
  },
  {
    stem: "relates-to",
    name: "relates-to",
    description:
      "A generic, thematically relevant connection that does not fit a more specific type. Use this as the catchall when two Things are worth connecting but none of the stronger relationships (`depends-on`, `part-of`, `derived-from`, etc.) apply. Prefer a more specific type whenever one fits — `relates-to` should be the last resort, not the first reach.",
  },
];

function frontmatter(name: string, description: string): string {
  // YAML-safe: quote if the value contains characters that trip the parser.
  const needsQuote = (s: string) => /[:#\-\[\]{}&*!|>'"%@`]/.test(s) || s.startsWith(" ") || s.endsWith(" ");
  const q = (s: string) => (needsQuote(s) ? JSON.stringify(s) : s);
  return `---\nname: ${q(name)}\ndescription: ${q(description)}\n---\n`;
}

export function scaffoldInit(absDir: string, opts: InitOptions): InitResult {
  const rootIndex = path.join(absDir, "index.md");
  if (fs.existsSync(rootIndex)) {
    return { filesWritten: [], alreadyInitialized: true };
  }

  fs.mkdirSync(absDir, { recursive: true });

  const filesWritten: string[] = [];
  const write = (rel: string, contents: string) => {
    const full = path.join(absDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
    filesWritten.push(rel);
  };

  write("index.md", frontmatter(opts.name, opts.description) + "\n");

  write(".gitignore", "node_modules/\ndist/\n.env*\n.DS_Store\n");

  const linkTypeNames = BASELINE_LINK_TYPES.map((t) => t.stem).join(", ");
  const linkTypesBody = `This collection declares the link types used in this graph. Each file under this directory (${linkTypeNames}) names one relationship class and describes when to use it. The filename stem is the canonical key that frontmatter \`links[].type\` values reference.

Declaring a type here attaches its description to every edge that uses it, so agents and humans can see what a relationship means without following another hop. The vocabulary is deliberately small — prefer extending an existing type's description over adding a new type, and keep the namespace flat.
`;
  write(
    "linkTypes/index.md",
    frontmatter("Link Types", "The declared vocabulary of relationships used in this graph.") +
      "\n" +
      linkTypesBody
  );

  for (const lt of BASELINE_LINK_TYPES) {
    write(`linkTypes/${lt.stem}.md`, frontmatter(lt.name, lt.description) + "\n");
  }

  write(".github/workflows/publish.yml", PUBLISH_WORKFLOW);

  // Empty CNAME placeholder — users replace the contents with their apex or
  // subdomain when they wire up a custom domain. An unwritten file would be
  // less discoverable; a zero-byte one shows up in `ls` and the publish
  // pipeline safely no-ops when it's empty.
  write("CNAME", "");

  return { filesWritten, alreadyInitialized: false };
}

/**
 * GitHub Actions workflow that publishes the graph to GitHub Pages on every
 * push to `main`. Installs spandrel globally (so the workflow doesn't need a
 * checked-in node project), then runs `spandrel publish` with `--base` set
 * to the repo name so project pages resolve assets correctly.
 *
 * Users flip the Pages source to "GitHub Actions" in the repo settings; no
 * other configuration is required.
 */
export const PUBLISH_WORKFLOW = `name: Publish

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  publish:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g spandrel
      - name: Publish graph
        run: |
          REPO="\${GITHUB_REPOSITORY##*/}"
          spandrel publish . --out _site --base "/\${REPO}/"
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
`;
