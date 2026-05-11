---
name: Violating Collection-Schema Fixture
description: Minimal graph exercising the WS-C3 validator against a member that violates every aspect of the strict client schema.
---

A small fixture for the collection-schema validator. The `clients/` collection's `DESIGN.md` declares strict frontmatter and graph rules; the single member here violates them along every axis the spec calls out in Example A. Used by the integration test to confirm the full warning set fires.
