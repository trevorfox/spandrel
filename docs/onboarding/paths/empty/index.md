---
name: Empty path
description: User has a purpose but no existing content — template selection drives the structure
links:
  - to: /onboarding/paths
    type: part-of
  - to: /onboarding/templates
    type: recommends
---

# Empty path

The user has a purpose from Level 0 and nothing else — an empty directory, or a `README` they just scaffolded.

## Signals you're on this path

- Directory is empty or has only a `README.md` that describes intent
- User says "I want to build X" rather than "I have this stuff, help me organize it"
- No files to inventory, no repo to survey
- Level 0 produced a clear purpose statement

**Not this path** if the user has any existing content — even a directory of transcripts or a handful of notes. That's [bulk](/onboarding/paths/bulk) or [survey](/onboarding/paths/survey).

## Inventory rules

No inventory to do. Skip directly to sense-making.

Confirm the purpose from Level 0 is concrete enough to drive structure:

- Too vague: "a wiki for my work"
- Concrete enough: "a CRM-style graph of prospects and active deals for my fractional-CMO practice"

If too vague, ask one or two sharpening questions before continuing.

## Sense-making

Skip the "what's your existing structure?" question — there's no existing content to reflect on. Go directly to:

1. **Template check.** Walk the user through [Tier-1 templates](/onboarding/templates) and ask which matches their purpose. If one fits (saas-startup, consulting-agency, code-repo, personal-repo, product-strategy), use it verbatim as the starting skeleton.
2. **Framework check.** If no template fits, ask the framework question: "is there a decomposition you already use for this kind of work?" See [frameworks](/patterns/frameworks).
3. **Custom.** If neither, propose 3–5 collections from first principles, grounded in the purpose. Ask the user to react.

## Seeding

1. Create the repo: new directory, `git init`, write root `index.md` with `name` and `description` from the purpose statement.
2. Create each collection directory with `index.md` and `design.md`. The `design.md` comes from the template if one was picked, or is written fresh.
3. Seed **three example Things per collection** — placeholder nodes the user can replace. Real data beats placeholders: ask the user to name three clients / projects / decisions / whatever their collections hold, and create those as the examples.
4. Write the knowledge repo's `README.md`.
5. Compile. Walk the graph.

## Gotchas

- **Placeholder-only risk.** A graph seeded with only generic example nodes (`example-client-1`) loses momentum. Always push for three real Things per collection even if they're half-specified — the user can complete them later.
- **Over-scoping.** First-time users want to design the perfect structure before writing anything. Five collections is plenty for day one; more can be added with `create_thing` later.
- **Template mismatch.** A template that almost-fits produces graphs the user fights. Rather than bending an inexact template, switch to custom.
