---
name: AGENT.md
description: Agent identity and behavior files — who an agent is when operating in a context. Compiled as a document node alongside its containing composite.
links:
  - to: /content-model/skill-md
    type: relates-to
---

# AGENT.md

An `AGENT.md` is a companion file that defines an agent's identity and behavioral guidelines when operating in a particular part of the graph. Where `SKILL.md` defines capabilities, `AGENT.md` defines personality and constraints — how the agent should communicate, what it should avoid, and what judgment calls to make.

Starting in 0.5.0, an `AGENT.md` alongside a composite compiles as a `kind: document, navigable: false` child at `<parent-path>/AGENT`. The plural form `AGENTS.md` (a Claude Code convention) is also recognized and compiles to `<parent-path>/AGENTS` — both forms are first-class.
