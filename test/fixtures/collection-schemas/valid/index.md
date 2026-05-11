---
name: Valid Collection-Schema Fixture
description: Minimal graph exercising the WS-C3 validator against a passing client member; expectation is zero schema warnings.
---

A small fixture for the collection-schema validator (WS-C3). The `clients/` collection's `DESIGN.md` declares strict frontmatter and graph rules; the one member here (`acme-corp`) conforms in every respect, so the audit pass should produce zero schema-validator warnings.
