---
name: Collections
description: Top-level collections as domain nouns — structuring entity types during bootstrap
links:
  - to: /content-model/nodes
    type: relates-to
  - to: /content-model/design-md
    type: relates-to
---

# Collections Pattern

Top-level collections are your nouns — the major entity types in your domain. Decide these upfront during bootstrap. They establish the vocabulary of your graph.

## What makes a good collection

- It represents a **category of Things**, not a single Thing
- You can describe what a "well-formed member" looks like
- Members share a common shape (similar frontmatter fields, similar link types)
- Other collections link to its members frequently

## Common collections by domain

**Consulting / agency:**
`/clients/`, `/projects/`, `/people/`, `/deliverables/`, `/decisions/`

**Engineering / platform:**
`/services/`, `/teams/`, `/decisions/`, `/incidents/`, `/runbooks/`

**CRM / sales:**
`/contacts/`, `/companies/`, `/deals/`, `/communications/`

**Research / knowledge base:**
`/topics/`, `/sources/`, `/findings/`, `/questions/`

**Product:**
`/features/`, `/specs/`, `/users/`, `/feedback/`, `/releases/`

## Structure

Every collection has:
- `index.md` — describes what the collection contains and why these Things belong together
- `design.md` — describes what a well-formed member looks like (frontmatter shape, expected links, anti-patterns)

```
clients/
├── index.md          # "Our client accounts and engagement history"
├── design.md         # "A client Thing should have: industry, status, account_lead link..."
├── acme-corp/
│   └── index.md
└── globex/
    └── index.md
```

## Guidelines

- **3-7 top-level collections** is the sweet spot. Fewer means overloaded categories. More means the root is hard to navigate.
- **Name collections as plural nouns.** `/clients/` not `/client/`. The directory name is the category.
- **Cross-collection links are the graph.** A person links to clients. A project links to people. These lateral connections are what make it more than a file tree.
- **Collections are recursive.** A collection can contain sub-collections: `/projects/active/`, `/projects/archived/`.
