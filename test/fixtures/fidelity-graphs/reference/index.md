---
name: Pacific Consulting
description: Consulting firm knowledge graph — strategic and growth-tier clients, the teams that serve them, and the people who lead each engagement.
---

# Pacific Consulting

The operational knowledge graph for Pacific Consulting. Three collections:

- `/clients` — every active client engagement, with tier, industry, and assigned teams.
- `/teams` — internal delivery teams, including the practice area each owns.
- `/people` — consultants, with their current account assignments and prior project history.

Edges between collections express who works on what: `served-by` links a client to its delivery team, `account-lead` links a client to the person responsible, and `member-of` links a person to their home team.
