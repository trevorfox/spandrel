---
name: Tags
description: A convention for cross-cutting discovery — connecting Things laterally across the tree without changing where they live.
links:
  - to: /primitives/things
    type: augments
    description: Tags add lateral discovery to the tree structure
---

Tags are a documented convention, not built into the compiler. A Thing can include tags in its frontmatter for cross-cutting discovery:

```yaml
tags: [active, enterprise, west-coast]
```

Tags connect Things across the tree laterally, without changing where they live. A client Thing lives in `/clients/` but might be discoverable via `active`, `enterprise`, or `west-coast`.

Tags enable filtering and discovery across Collection boundaries — they complement the tree hierarchy with a flat, orthogonal dimension.
