---
name: Progressive Disclosure
description: Making Things understandable at multiple levels of depth — from name to full content
links:
  - to: /architecture/access
    type: relates-to
---

# Progressive Disclosure Pattern

Every Thing in the graph should be understandable at multiple levels of depth. A reader (human or agent) should be able to decide whether to go deeper based solely on the description.

## The levels

1. **Name** — what is this? (`Acme Corporation`)
2. **Description** — should I care? (`Enterprise SaaS client, onboarded Q2 2025, primary account lead is Jane`)
3. **Content** — the full picture (markdown body of index.md)
4. **Children** — what's inside? (sub-Things, if composite)

## Writing good descriptions

A description answers: "Is this the Thing I'm looking for, and is it worth reading further?"

**Good:** `Enterprise SaaS client, onboarded Q2 2025, $2.4M ARR, primary account lead is Jane`
**Bad:** `Client files for Acme`

**Good:** `Quarterly architecture review process — runs first Monday of each quarter, produces decisions logged in /decisions/`
**Bad:** `Architecture reviews`

## For index.md files (collections)

A collection's index.md should summarize what's below. Not just list children — describe the space.

**Good:**
```markdown
Our active and past client engagements. Each client Thing tracks the relationship,
key contacts, active projects, and engagement history. See [design.md](design.md)
for what a well-formed client looks like.
```

**Bad:**
```markdown
- [Acme](/clients/acme)
- [Globex](/clients/globex)
```

## For agents

Agents use progressive disclosure to navigate efficiently. `get_node` with `depth=2` gives names and descriptions for two levels — enough to orient without reading full content. Only call `get_content` when you've found the right node.
