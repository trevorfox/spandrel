# Access Control Design

Governance layer that wraps Things and Collections to define access boundaries.

## Principles
- Access is a layer, not a primitive
- Read and write permissions are separate
- Changing governance doesn't require restructuring the tree
- Defers to established patterns: RBAC, ABAC, IAM

## Deferred
- Full implementation is deferred
- The concept exists in the architecture; implementation is a design decision for later
