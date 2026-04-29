---
name: Static + flat-file MCP
description: Deploy a Spandrel knowledge graph as static files plus a thin MCP shim — works on GitHub Pages, Vercel, Cloudflare, or embedded in an existing site.
---

# Static + flat-file MCP

The simplest production-ready deployment: `spandrel publish` writes a bundle of flat files; a thin serverless function translates MCP tool calls into fetches against those files. Read-only, cheap, embeddable in any existing site.

## See it live

This pattern runs in production at [**mcp.spandrel.org**](https://mcp.spandrel.org), serving the Spandrel docs bundle at [spandrel.org](https://spandrel.org). The adapter is a ~150-line Next.js app — one route handler that wires the MCP SDK's Streamable HTTP transport to a [`RemoteGraphStore`](/architecture/storage) pointed at the bundle URL.

Source: [**trevorfox/spandrel-mcp**](https://github.com/trevorfox/spandrel-mcp). To replicate for your own graph:

1. Fork the repo.
2. Set `SPANDREL_BUNDLE_URL` to your published bundle's origin.
3. Deploy to Vercel. Point a subdomain at it.

That's the whole change — the adapter is generic across any Spandrel-published bundle.

## What gets emitted

`spandrel publish <path> --static --base <path> --site-url <origin>` produces:

```
_site/
├── graph.json                  Structural skeleton (no bodies)
├── robots.txt                  Keeps crawlers on HTML, off .md/.json
├── index.html                  Prerendered root page + SPA bundle shell
├── index.md                    Root node markdown
├── index.json                  Root node full JSON
├── <path>/
│   ├── index.html              Prerendered per-node page
│   ├── index.md
│   └── index.json
├── <path>.md                   Sibling form (scrape-friendly)
├── <path>.json
├── assets/                     SPA bundle (CSS, JS)
└── CNAME                       If one existed in the source repo
```

Three formats per node at each path, two URL layouts for `.md` and `.json` (sibling and directory), all with sensible MIME types and `robots.txt` pointing search engines at the HTML.

## Where to host it

Anywhere that serves static files:

- **GitHub Pages** — zero-config, GitHub Actions republishes on push to main. `--base /<repo>/` matches project-pages URL structure.
- **Netlify / Vercel CDN** — drag-and-drop or Git-integrated. Both offer built-in password protection at the edge.
- **S3 + CloudFront** — classic static hosting. Any CDN in front of object storage works.
- **A subdirectory of an existing site** — drop the bundle into `/kb/` on your existing server, serve alongside the rest of your site.

## Adding MCP to the bundle

The bundle alone gives humans a viewer and agents scrape-friendly URLs. To add a real MCP endpoint that agents can speak to, deploy a thin HTTP handler alongside the bundle. The wiring:

1. Construct a `RemoteGraphStore` pointed at the bundle URL — reads `graph.json` and per-node files over HTTP.
2. Construct an [Access Policy](/architecture/access-policy) — for a static bundle, the policy is read-only by construction; the reference implementation ships a default policy that allows `traverse`-level reads and denies all writes.
3. Build an [MCP server](/architecture/mcp) wired to the store and policy.
4. Wrap the MCP server in the MCP SDK's `StreamableHTTPServerTransport` and mount under `/mcp`.

The canonical example is the published [trevorfox/spandrel-mcp](https://github.com/trevorfox/spandrel-mcp) adapter — a ~150-line Next.js app that runs in production at [mcp.spandrel.org](https://mcp.spandrel.org). It's the easiest starting point: fork it, set `SPANDREL_BUNDLE_URL`, deploy.

The `RemoteGraphStore` reads from the bundle URL on every tool call — `graph.json` once (cached), per-node `index.json` on demand. Writes are rejected at the policy layer, so agents cannot modify a static bundle no matter what they try.

The same pattern works on Vercel Edge Functions, Cloudflare Workers, Netlify Functions, or plain Node — only the outer handler signature changes.

No database, no compile step at request time. The serverless function is the only non-static piece.

## Password-protecting the bundle

Static-file auth happens at the HTTP layer, not inside Spandrel. Options in ascending effort:

1. **Host-specific password** — Netlify's Visitor Access, Vercel's Deployment Protection. Single shared password.
2. **Basic Auth via middleware** — Vercel Edge Middleware, Cloudflare Workers, or `.htaccess` on Apache. Env-var driven.
3. **Cloudflare Access** — identity-based (SSO, email OTP, device posture). Free tier up to 50 users. Works in front of any origin.

MCP clients pass the corresponding Authorization header via the `headers` field in the Claude Desktop config.

## What this deployment can't do

- **Writes from agents or users** — the bundle is immutable until the next publish. Authoring happens at the source, republish is the write path.
- **Identity-aware reads** — all authenticated requests see the same bundle. For per-user views, use a writable backend.
- **Federation across repos** — shared collections mounted across multiple tenants need a shared live backend.
- **Semantic search** — embeddings require compute the static bundle can't provide. Ship a pre-built search index at publish time if you need search at scale.

## Trade-off summary

| Want this | Use static + flat-file MCP |
|---|---|
| Public or shared-team read-only knowledge base | ✓ |
| MCP access from agents without running a server | ✓ |
| Drop into an existing website subdirectory | ✓ |
| ~$0 hosting | ✓ |
| Agents write to the graph | Use a writable backend |
| Per-user governed reads | Use a writable backend |
| Live updates without a publish cycle | Use a writable backend |
