# ADR 001: Baseline Architecture Documentation

**Status:** Accepted

**Date:** 2026-03-03

**Deciders:** Development team

**Related:** [Security Audit](../audit/security-audit-2026-03-03.md), [Sprint Log](../../knowledge/SPRINT_LOG.md)

---

## Context

IBM RideMatch CarPooling app was recovered from a Netlify deployment with minimal documentation. Before making any improvements, we need to document the current architecture as-found to establish a baseline.

This ADR serves two purposes:
1. Document what exists (not what should exist)
2. Provide context for future architectural decisions

**Current State:**
- 6 files, 4,568 total lines
- Vanilla JavaScript (no framework)
- Firebase Realtime Database for backend
- Google Maps integration
- PWA with Service Worker
- No tests, minimal documentation

---

## Decision

We **accept and document** the current architecture as the baseline, recognizing both its strengths and weaknesses.

### Technology Stack (As-Found)

**Frontend:**
- **Language:** Vanilla JavaScript (ES6+)
- **No Framework:** No React, Vue, Angular, or build system
- **UI:** Pure HTML + CSS (IBM design system inspired)
- **State Management:** In-memory JavaScript objects + localStorage

**Backend:**
- **Database:** Firebase Realtime Database
- **Authentication:** Custom implementation (localStorage-based)
- **Hosting:** Netlify (static site hosting)
- **APIs:** Firebase SDK + Google Maps JavaScript API

**Infrastructure:**
- **PWA:** Service Worker for offline capability
- **Caching:** Network-first strategy
- **Storage:** localStorage for offline data
- **Sync:** Firebase real-time listeners

### Architecture Pattern

**Client-Side Monolith:**
```
index.html
    ↓
app.js (2,095 lines — ALL application logic)
    ├── Authentication
    ├── Ride Management
    ├── Request Handling
    ├── Chat System
    ├── Trip Tracking (GPS)
    ├── Rating System
    ├── Notifications
    ├── Firebase Sync
    └── Google Maps Integration
    ↓
styles.css (1,882 lines — ALL styling)
    ↓
Firebase Realtime Database (shared data)
```

**Data Flow:**
```
User Action
    ↓
JavaScript Event Handler
    ↓
Update In-Memory State
    ↓
Update localStorage (offline persistence)
    ↓
Sync to Firebase (if online)
    ↓
Firebase Listeners Update Other Clients
    ↓
UI Re-renders
```

### File Organization

| File | Purpose | Size | Status |
|------|---------|------|--------|
| `index.html` | UI structure, all components | 512 lines | ✅ Clean |
| `app.js` | All application logic | 2,095 lines | 🟡 Large |
| `styles.css` | Complete design system | 1,882 lines | ✅ Organized |
| `manifest.json` | PWA configuration | 21 lines | ✅ Standard |
| `sw.js` | Service Worker (offline) | 58 lines | ✅ Simple |
| `icon-512.png` | App icon | 17KB | ✅ Standard |

### Security Model (Current)

- **Authentication:** Custom (localStorage-based, plain-text passwords)
- **Authorization:** Client-side checks only
- **Validation:** Client-side only
- **API Keys:** Exposed in source code
- **Session Management:** localStorage (no expiry)

🔴 **Note:** Current security model has critical vulnerabilities (see Security Audit)

---

## Alternatives Considered

### Alternative 1: Rewrite with Modern Framework
- **Description:** Rebuild from scratch using React/Vue + TypeScript
- **Pros:**
  - Modern best practices
  - Better tooling
  - Easier testing
  - Type safety
- **Cons:**
  - Complete rewrite (weeks of work)
  - May introduce new bugs
  - Lose working features during migration
  - Over-engineering for current scope
- **Why not chosen:** App is functionally complete. Focus on securing existing code first, not rebuilding.

### Alternative 2: Keep As-Is Forever
- **Description:** No documentation, no improvements, deploy as-is
- **Pros:**
  - Zero effort
- **Cons:**
  - Security vulnerabilities unresolved
  - No understanding of architecture
  - Difficult to maintain
  - Not production-ready
- **Why not chosen:** Security issues are blocking. Must address before deployment.

---

## Consequences

### Positive
- ✅ **Baseline Established:** Clear starting point for improvements
- ✅ **No Premature Rewrite:** Avoid throwing away working code
- ✅ **Focus on Security:** Address real risks before theoretical improvements
- ✅ **Simple Stack:** No build complexity, easy to understand
- ✅ **Fast Iteration:** Changes visible immediately (no build step)

### Negative
- 🔴 **Security Gaps:** Critical vulnerabilities documented but not yet fixed
- 🟡 **Large Files:** 2K-line file limits maintainability
- 🟡 **No Tests:** Refactoring is risky without test coverage
- 🟡 **Client-Side Heavy:** All logic in browser (potential performance issues at scale)

### Neutral
- ⚪ **Vanilla JS:** Neither good nor bad — depends on team preference
- ⚪ **No Build System:** Simplicity vs tooling trade-off

---

## Implementation Notes

This ADR is **descriptive**, not prescriptive. It documents what exists, not what should be built.

**Key Principles:**
1. **Accept Current State:** Don't fight the existing architecture
2. **Security First:** Fix critical gaps before enhancements
3. **Incremental Improvement:** Improve systematically, not chaotically
4. **Document Decisions:** All future changes get their own ADRs

---

## Compliance

Future ADRs will reference this baseline when proposing changes. Any deviation from current architecture must be justified in its own ADR.

---

## Review

This ADR should be reviewed if:
- Major architectural changes are proposed (new framework, database change)
- Current architecture proves insufficient for new requirements
- Security model is completely rebuilt

**Next Review:** After security remediation (ADR-002) is complete

---

**References:**
- [Security Audit Report](../audit/security-audit-2026-03-03.md)
- [Sprint Log — Baseline Metrics](../../knowledge/SPRINT_LOG.md)
- [Session 001 Journal](../journal/001-project-initialization.md)
- [app.js](../../app.js) — Current implementation
