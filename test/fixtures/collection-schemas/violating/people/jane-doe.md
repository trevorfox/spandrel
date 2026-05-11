---
name: Jane Doe
description: A person; intentionally targeted by the violating member's `served-by` link to exercise link_target_mismatch.
---

# Jane Doe

Exists so the violating fixture's link to `/people/jane-doe` doesn't fire `broken_link`. The point is to fire `link_target_mismatch`, not a broken-link warning.
