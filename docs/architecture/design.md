# Architecture — Design

A well-formed architecture node should:

- Describe what the subsystem does and what contract it satisfies
- Be implementation-agnostic — describe the interface, not the TypeScript
- Reference the corresponding `design.md` in `src/` for implementation-specific decisions
- Link to content model concepts it depends on

Anti-patterns:
- Narrating the implementation code
- Including TypeScript types or function signatures
- Coupling to a specific storage backend or deployment target
