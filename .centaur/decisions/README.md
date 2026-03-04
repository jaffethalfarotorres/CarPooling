# Architecture Decision Records (ADRs)

> **Purpose:** Document all significant architectural and technical decisions for IBM RideMatch CarPooling project.
>
> **Format:** Michael Nygard ADR template (Context/Decision/Consequences)
> **Inspiration:** [Architecture Decision Records](https://adr.github.io/)

---

## What are ADRs?

Architecture Decision Records (ADRs) capture important architectural decisions made during development, including:
- The context and problem being solved
- The decision made
- Alternatives considered
- Consequences (positive and negative)

## Why We Use ADRs

1. **Historical Context** — Future developers understand *why* decisions were made
2. **Traceability** — Link decisions to requirements and outcomes
3. **Accountability** — Clear record of who decided what and when
4. **Learning** — Reflect on past decisions, improve future ones

## ADR Lifecycle

```
Proposed → Accepted → Deprecated → Superseded
```

- **Proposed:** Under consideration
- **Accepted:** Decision is active and implemented
- **Deprecated:** Decision is outdated but still in use
- **Superseded:** Replaced by a newer decision (link to new ADR)

## Template

See [adr-template.md](./adr-template.md) for the standard format.

## Index of Decisions

| # | Title | Status | Date |
|---|-------|--------|------|
| [001](./001-baseline-architecture.md) | Baseline Architecture Documentation | Accepted | 2026-03-03 |
| [002](./002-security-strategy.md) | Security Improvement Strategy | Accepted | 2026-03-03 |
| [003](./003-code-organization.md) | Code Organization Strategy | Proposed | 2026-03-03 |
| [004](./004-testing-strategy.md) | Testing Strategy & Framework | Proposed | 2026-03-03 |

---

## Contributing

When making significant architectural decisions:

1. Copy `adr-template.md` to new file: `NNN-short-title.md`
2. Fill in all sections
3. Discuss with team (if applicable)
4. Commit with decision (or before implementation)
5. Update this README index

---

**Maintained by:** Development team
**Format:** Michael Nygard ADR template
**Inspired by:** Centaur Agent methodology (systematic decision documentation)
