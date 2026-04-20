---
name: Regulated / audit
description: Regulations → policies → controls → procedures → evidence → systems → incidents. Tier-2 stub; fill in as you use it.
links:
  - to: /onboarding/templates
    type: part-of
---

# Regulated / audit template (stub)

## When this fits

Fintech, healthcare, government contractors — organizations where audit questions take the shape "show me the policy → procedure → control → code → evidence → training record" and that chain exists but lives in 8 different tools. The graph makes audit traversal rather than search.

## Collection skeleton

```
regulations/    — external obligations (PCI, SOC2, HIPAA, GDPR clauses)
policies/       — internal policy statements that respond to regulations
controls/       — implementations of policies
procedures/     — how we operate controls
evidence/       — artifacts proving controls operate (logs, screenshots, attestations)
systems/        — where controls run
incidents/      — things that went wrong
```

## Edge vocabulary

- **`addresses`** — a policy addresses a regulation
- **`implements`** — a control implements a policy
- **`operationalizes`** — a procedure operationalizes a control
- **`evidence-for`** — an artifact is evidence for a control in a time window
- **`runs-on`** — a control or procedure runs on a specific system
- **`violated`** — an incident violated a specific control
- **`remediated-by`** — an incident was remediated by a specific change or new control
- **`supersedes`** — a policy, control, or procedure supersedes a prior version

## Day-one questions

- "Show me all controls implementing PCI requirement 3.2." → traverse `/regulations/pci-3-2` for `addresses` → `implements` chain
- "Give me the evidence chain for control X for Q2." → traverse `/controls/x` for `evidence-for` edges, filter by date
- "Which controls have been violated, and how were they remediated?" → traverse `/incidents` for `violated` → `remediated-by` edges
- "What systems run our access-control policy?" → traverse policy → implementing controls → `runs-on` edges
- "What's the latest version of our data-retention policy, and what did it supersede?" → traverse policy collection for `supersedes` chain

## Extension hints

- **Training records.** Add `/training/` when auditors start asking who-was-trained-on-what. Link `attested-by` from training records to people.
- **Risk register.** Add `/risks/` with `mitigated-by` edges to controls. Bowtie-shaped if the analysis gets serious (see [frameworks](/patterns/frameworks)).
- **Third-party vendors.** Add `/vendors/` for supply-chain audit. Each vendor links to the systems or data flows it touches.

## Access considerations

This template pushes hardest on access control. Auditors get `traverse` across policy → evidence; general employees get `content` on procedures but only `description` on controls and evidence. Plan the `_access/config.yaml` alongside the graph shape — see [architecture/access](/architecture/access).

## Stub status

This template ships as a starting shape. Expand it as you use it — extension hints, example traversal, and `design.md` starters per collection are still to be written.
