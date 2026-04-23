---
name: Limestone
description: Default visual identity for the Spandrel web viewer — warm off-white paper, deep graphite ink, ochre accents. A reading-room aesthetic for knowledge graphs.
colors:
  # Light mode — "limestone". Warm off-white, deep graphite, soft ochre.
  light:
    bg: "#f4efe6"
    bg-elevated: "#ede7db"
    bg-sunken: "#ece5d6"
    fg: "#2a2825"
    fg-muted: "#6a6559"
    fg-subtle: "#948d7d"
    accent: "#a67c3c"
    accent-muted: "#c9a770"
    rule-color: "#d6cdb9"
    rule-strong: "#b8ae96"
    link-color: "#7a5a26"
    warning-bg: "#efe1c4"
    warning-fg: "#6b4c14"
    selection: "#e6d6a8"
    node-fill: "#e6dcc4"
    node-stroke: "#6a6559"
    edge-stroke: "#b8ae96"
    current-fill: "#a67c3c"
    current-stroke: "#6b4c14"
  # Dark mode — "candlelit stone". Warm charcoal, cream, amber.
  dark:
    bg: "#1e1c19"
    bg-elevated: "#26231f"
    bg-sunken: "#181614"
    fg: "#ebe3d4"
    fg-muted: "#a49c8c"
    fg-subtle: "#756d60"
    accent: "#c9953a"
    accent-muted: "#a67c3c"
    rule-color: "#3a362f"
    rule-strong: "#514b41"
    link-color: "#d9ac5a"
    warning-bg: "#302617"
    warning-fg: "#e6c58a"
    selection: "#3a2f1b"
    node-fill: "#2e2a23"
    node-stroke: "#756d60"
    edge-stroke: "#3a362f"
    current-fill: "#c9953a"
    current-stroke: "#e6c58a"
typography:
  h1:
    fontFamily: Source Serif 4
    fontSize: 2.25rem
    lineHeight: 1.25
    letterSpacing: -0.01em
    fontWeight: 400
  h2:
    fontFamily: Source Serif 4
    fontSize: 1.75rem
    lineHeight: 1.25
    fontWeight: 600
  h3:
    fontFamily: Source Serif 4
    fontSize: 1.375rem
    lineHeight: 1.25
    fontWeight: 600
  body:
    fontFamily: Source Serif 4
    fontSize: 1.0625rem
    lineHeight: 1.6
    fontWeight: 400
  small:
    fontFamily: Source Serif 4
    fontSize: 0.875rem
    lineHeight: 1.6
  label-caps:
    fontFamily: system-ui
    fontSize: 0.75rem
    letterSpacing: 0.08em
    textTransform: uppercase
  code:
    fontFamily: "ui-monospace, SFMono-Regular"
    fontSize: 0.9em
spacing:
  "1": 0.25rem   # 4px
  "2": 0.5rem    # 8px
  "3": 0.75rem   # 12px
  "4": 1rem      # 16px
  "5": 1.5rem    # 24px
  "6": 2rem      # 32px
  "7": 3rem      # 48px
  "8": 4rem      # 64px
rounded:
  sm: 2px
  md: 4px
  pill: 999px
layout:
  content-max-width: 44rem
  top-bar-height: 3.25rem
  drawer-collapsed-height: 2.5rem
  drawer-expanded-height: 14rem
  rule-weight: 1px
  mobile-breakpoint: 600px
  tablet-breakpoint: 900px
---

## Overview

**Limestone** is the default visual identity for Spandrel's web viewer
(the SPA that ships in `dist/web/` and is emitted by `spandrel publish`).
The aesthetic is a *reading room* — warm off-white paper, deep graphite
ink, hairline rules, and a single ochre accent. It's designed to make
dense, typographic content (markdown bodies, link frontmatter, node
descriptions) feel quiet and deliberate, not busy.

The graph visualization uses the same palette — nodes are small ochre
dots on the same paper background, deliberately muted so the graph reads
as *supplementary* to the text body rather than competing with it.

## Colors

The palette splits into two modes — *Limestone* (light) and *Candlelit
Stone* (dark) — that share shape but invert value.

### Light: Limestone

Warm off-white background (`bg: #f4efe6`) with deep graphite text
(`fg: #2a2825`). Elevated surfaces (`bg-elevated`) are a half-step
deeper to suggest card-like elevation without shadows. Rules are
hairline `#d6cdb9` — present enough to divide, faint enough to not
demand attention.

The single accent is **ochre** (`accent: #a67c3c`), used sparingly: the
current graph node, link color hover states, and small callouts. It's
desaturated enough to coexist with the paper tones without feeling
branded.

`link-color: #7a5a26` is a darker ochre — intentionally more readable
than the accent itself, so inline links inside prose don't require a
hover to confirm they're interactive.

### Dark: Candlelit Stone

Warm charcoal background (`bg: #1e1c19`) with cream text
(`fg: #ebe3d4`). The palette rotates rather than inverts — the dark
mode isn't "light mode minus white" but a deliberate candlelit
atmosphere where amber warms the graphite.

Accent shifts to `c9953a` — a brighter amber than the light mode's
ochre — to maintain perceived vibrancy against the darker ground.

### Contrast

All body text / background combinations pass WCAG AA at 4.5:1.

- `fg` on `bg` (light): graphite on off-white → ~11:1
- `fg-muted` on `bg` (light): slate on off-white → ~5.2:1
- `fg` on `bg` (dark): cream on charcoal → ~13:1
- `link-color` on `bg` (light): dark ochre on off-white → ~5:1

## Typography

The viewer is set in **Source Serif 4** for every content surface
— headings, body, captions, and the site banner. A single typeface
throughout keeps the page feeling editorial (closer to a journal than
a web app) and avoids the visual noise of mixed serif/sans pairing.

**Monospace** (`ui-monospace` stack) is reserved for code spans, the
breadcrumb path, and the MCP endpoint box — anything that reads as
*literal text* rather than prose.

**System sans** is used only for the small-caps labels (RELATED,
WARNINGS, ARCHITECTURE, etc.) where Source Serif's italic wouldn't
carry small-caps glyphs reliably across weights.

Sizes follow a 1.25× scale from `fs-base` (17px). Base size of 17px
is deliberately one step above the web default (16px) — at the reading
distance of a knowledge graph, 17px gives better horizontal leading
without needing to expand the content column.

## Spacing

An eight-step scale from 4px to 64px (`s-1` through `s-8`). No
half-steps. Vertical rhythm is usually `s-3` (12px) or `s-4` (16px);
section breaks use `s-6` (32px). The content column maxes at
`44rem` (~704px at base font) — roughly 70 characters per line, the
classic book-typography sweet spot.

## Components

### Site banner

A single hairline row at the top: `{name} · {tagline}`. The name is
bold graphite, the separator (`·`) is `fg-subtle`, the tagline is
`fg-muted` italic. The whole row is a link back to `/`. Total height
~48px; serves as both nav home and identity mark.

### Top bar

Below the site banner. Desktop: breadcrumb + search + view-format
toggle + theme toggle. Mobile: search + theme toggle only (breadcrumb
collapses; format toggle moves into the drawer footer).

### Content

The primary reading stage. Max width `--content-max-w`. On desktop,
shares the viewport with the graph pane at 50/50. On tablets (600–900px)
the graph moves below the content. On phones, the content and graph
each own the full stage and a floating **Read/Map pill** switches
between them.

### Graph pane

D3 force-directed layout. Nodes are `r=10` circles filled with
collection color from a palette of six warm ochres/greens/clays. The
current node is larger (`r=13`) and filled with `current-fill`. Edges
are `edge-stroke` at 0.6 opacity; typed edges (non-hierarchy links)
render at higher opacity and slightly thicker.

A legend in the top-right lists collections with their color swatches.
On mobile the legend is hidden — the graph fills the stage and
discovery happens by tapping nodes.

### Drawer

A bottom pane (`drawer-expanded-height: 14rem`, collapses to a
`2.5rem` handle) listing the current node's incoming references and
any validation warnings. Collapsed by default on phone; expanded by
default on desktop when there's content to show.

### View pill (mobile only)

A floating `Read | Map` toggle at the bottom center of the viewport.
Modeled on Apple/Google Maps' "Map/Satellite" switcher — one control,
thumb-zone, rounded to visually separate from the rectangular chrome.

## Rationale

### Why a reading-room aesthetic?

Spandrel knowledge graphs are typographic artifacts — long-form
markdown bodies, structured frontmatter, link relationships with
descriptions. The viewer's job is to make that content feel
*authoritative and legible*, not clever. The limestone aesthetic
borrows from academic presses and art-book catalogues: warm paper,
deep ink, restrained accents, generous margins.

### Why one typeface?

Source Serif 4 is a variable font with optical-size axes — it looks
good at 12px captions and 36px headlines from the same file. Using it
everywhere (1) simplifies the typography system, (2) reduces network
cost, (3) keeps the page feeling like one artifact rather than a
collage of web conventions.

### Why muted graph colors?

A knowledge graph visualization is inherently busy — even a 50-node
graph has hundreds of edges. A saturated palette turns the graph into
visual noise that competes with the text body. The muted ochres read
as *quiet supplementary information* — present, but not demanding
attention. The current node breaks from the palette precisely to stand
out against this calm.

### Why hairline rules?

Heavy borders are a failure of typography — they're used when spacing
and hierarchy aren't doing enough work. The 1px rules in Limestone
mostly serve to mark stage boundaries (site banner, top bar, drawer).
Inside the content column, there are none — hierarchy comes from type
size, weight, and vertical rhythm.

## Customization

The visual identity is implemented as CSS custom properties in
`src/web/app/styles/tokens.css`. Override any subset to theme your
own Spandrel deployment; the component styles consume tokens by
name, so changes propagate automatically.

A DESIGN.md file for a customized Spandrel deployment should either:
1. Extend this file — keep the token shape, change values.
2. Replace it — declare a fully new palette and rationale.

Either way, `npx @google/design.md lint DESIGN.md` will validate
token references and WCAG contrast.
