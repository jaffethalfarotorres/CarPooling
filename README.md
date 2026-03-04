# 🚗 IBM RideMatch — Carpooling for IBM Costa Rica

**A Progressive Web App (PWA) for coordinating carpools among IBM employees commuting to AFZ Building F30, Heredia, Costa Rica.**

[![Security Audit](https://img.shields.io/badge/security-needs_improvement-red)](.centaur/audit/security-audit-2026-03-03.md)
[![Test Coverage](https://img.shields.io/badge/coverage-0%25-red)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🎯 What is RideMatch?

RideMatch connects IBM employees who want to share rides for their daily commute, reducing costs, traffic, and environmental impact.

### Key Features

- 🚙 **Offer & Find Rides** — Post available seats or search for rides
- 📍 **Smart Matching** — Filter by neighborhood, direction (to/from IBM), date
- 💬 **Group Chat** — Coordinate pickup details per ride
- 📍 **Live Tracking** — Real-time GPS tracking with ETA (demo + live modes)
- ⭐ **Rating System** — Rate drivers for reliability
- 🔔 **Notifications** — Stay updated on ride requests and approvals
- 📱 **PWA** — Install on mobile, works offline
- ☁️ **Cloud Sync** — Multi-device real-time synchronization

---

## 🚨 **Important: Security Status**

**⚠️ THIS APP IS NOT PRODUCTION-READY**

A comprehensive security audit (2026-03-03) identified **critical vulnerabilities**:

- 🔴 **Exposed API keys** in source code
- 🔴 **Plain-text password storage**
- 🔴 **No server-side validation**

**Status:** Security remediation in progress (Sprint 001)

See [Security Audit Report](.centaur/audit/security-audit-2026-03-03.md) for details.

---

## 📁 Project Structure

```
CarPooling/
├── index.html          # UI structure (512 lines)
├── app.js              # Application logic (2,095 lines)
├── styles.css          # Complete design system (1,882 lines)
├── manifest.json       # PWA configuration
├── sw.js               # Service Worker (offline support)
├── icon-512.png        # App icon
│
├── .centaur/           # Systematic documentation (Centaur methodology)
│   ├── journal/        # Session logs
│   ├── audit/          # Security & quality audits
│   └── decisions/      # Architecture Decision Records (ADRs)
│
├── knowledge/          # Project knowledge base
│   ├── SPRINT_LOG.md   # Health metrics & progress tracking
│   └── CHRONICLE.md    # Long-term learnings & context
│
└── docs/               # User & developer documentation
    └── [future docs]
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Backend** | Firebase Realtime Database |
| **Maps** | Google Maps JavaScript API |
| **Authentication** | ⚠️ Custom (migrating to Firebase Auth) |
| **Hosting** | Netlify (static site) |
| **PWA** | Service Worker, Web App Manifest |
| **Storage** | localStorage + Firebase sync |

**Design Philosophy:** Simple, no build step, easy to understand.

---

## 🚀 Quick Start

### Prerequisites

- Modern web browser (Chrome, Firefox, Edge, Safari)
- Firebase project (for database)
- Google Maps API key

### Setup

**⚠️ Note:** Full setup instructions coming soon. Current version requires manual configuration.

1. **Clone the repository**
   ```bash
   git clone https://github.com/[username]/CarPooling.git
   cd CarPooling
   ```

2. **Configure Firebase** (TEMPORARY — will move to `.env`)
   - Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Realtime Database
   - Copy configuration to `app.js` lines 20-29

3. **Configure Google Maps**
   - Get API key from [Google Cloud Console](https://console.cloud.google.com)
   - Enable Maps JavaScript API, Places API, Directions API, Geometry API
   - Add key to `index.html` script tag

4. **Serve locally**
   ```bash
   # Simple HTTP server
   python -m http.server 8000
   # or
   npx serve .
   ```

5. **Open in browser**
   ```
   http://localhost:8000
   ```

### First Use

1. Register with an IBM email (@ibm.com)
2. Complete your profile (name, phone, neighborhood)
3. Explore:
   - **Dashboard** — Quick access to features
   - **Offer Ride** — Post available seats
   - **Find Ride** — Search for rides
   - **My Rides** — Track your rides

---

## 📊 Project Status

**Current Sprint:** 001 — Foundation & Security (2026-03-03 → 2026-03-10)

| Metric | Value | Status |
|--------|-------|--------|
| **Features** | 9 implemented | ✅ Complete |
| **Security** | Grade D | 🔴 **CRITICAL** |
| **Tests** | 0% coverage | 🔴 Needs work |
| **Documentation** | In progress | 🟡 Improving |

See [Sprint Log](knowledge/SPRINT_LOG.md) for detailed metrics.

---

## 🔒 Security Roadmap

### Current Issues (Sprint 001 — In Progress)

**Week 1: Critical Fixes**
- [ ] Move Firebase config to environment variables
- [ ] Migrate to Firebase Authentication
- [ ] Implement Firebase Security Rules
- [ ] Add input sanitization

**Target:** Security grade 🔴 D → 🟢 B+

See [Security Strategy ADR](.centaur/decisions/002-security-strategy.md) for full plan.

---

## 🧪 Development

### Running Tests

**⚠️ Tests not yet implemented**

Coming in Sprint 002:
- Jest for unit tests
- Cypress for E2E tests
- Target: 60%+ coverage

### Code Organization

**Current:** Single-file architecture (`app.js` — 2,095 lines)

**Planned (Sprint 002):** Modular architecture
```
src/
├── auth.js          # Authentication
├── rides.js         # Ride management
├── requests.js      # Request handling
├── chat.js          # Chat system
├── tracking.js      # GPS tracking
├── ratings.js       # Rating system
├── notifications.js # Notifications
├── firebase.js      # Firebase sync
├── maps.js          # Google Maps
└── utils.js         # Shared utilities
```

See [Code Organization ADR](.centaur/decisions/003-code-organization.md) (when created).

---

## 📚 Documentation

### For Developers

- [Sprint Log](knowledge/SPRINT_LOG.md) — Current health metrics & progress
- [Chronicle](knowledge/CHRONICLE.md) — Project history & key learnings
- [ADRs](.centaur/decisions/) — Architecture decisions with rationale
- [Security Audit](.centaur/audit/security-audit-2026-03-03.md) — Comprehensive security findings

### For Contributors

- [CONTRIBUTING.md](CONTRIBUTING.md) — *Coming soon*
- [Session Journals](.centaur/journal/) — Detailed development logs

---

## 🎨 Design

**Inspired by IBM Carbon Design System**

- Dark theme (professional, reduces eye strain)
- Glass morphism effects (modern aesthetic)
- IBM blue accent color (#0f62fe)
- Mobile-first responsive design
- Bottom navigation for easy thumb reach

---

## 🗺️ Roadmap

### ✅ Sprint 001: Foundation & Security (Current)
- Environment configuration
- Firebase Authentication migration
- Security Rules implementation
- Comprehensive documentation

### 📋 Sprint 002: Testing & Modularization (Planned)
- Split into ES6 modules
- Jest test suite
- 30%+ test coverage
- ESLint configuration

### 📋 Sprint 003: Documentation & Polish (Planned)
- Expanded README
- CONTRIBUTING.md
- Developer docs
- Architecture diagrams

### 📋 Sprint 004: Enhancement (Future)
- Accessibility audit (WCAG 2.1)
- Performance optimization
- CI/CD pipeline
- Mobile testing

---

## 🤝 Contributing

**We welcome contributions!**

Current priority areas:
1. **Security improvements** (see Sprint 001)
2. **Test coverage** (Sprint 002)
3. **Documentation** (Sprint 003)
4. **Accessibility** (Sprint 004)

*Full contribution guidelines coming soon.*

---

## 📄 License

**[License Type]** — *To be determined*

---

## 🙏 Acknowledgments

- **IBM Costa Rica** employees for the use case
- **Firebase** for backend infrastructure
- **Google Maps** for location services
- **Centaur Agent methodology** for systematic development approach

---

## 📞 Contact

**Issues:** [GitHub Issues](https://github.com/[username]/CarPooling/issues)

**Questions:** [Create a discussion](https://github.com/[username]/CarPooling/discussions)

---

## 📈 Metrics

### Code Stats
- **Total Lines:** 4,568
- **Features:** 9
- **Files:** 6 (core) + 8 (documentation)
- **Languages:** JavaScript (82%), CSS (37%), HTML (24%)

### Health Dashboard
- **Security:** 🔴 Grade D (improving)
- **Tests:** 🔴 0% (Sprint 002)
- **Docs:** 🟡 Improving
- **Features:** ✅ 100% functional

See [Sprint Log](knowledge/SPRINT_LOG.md) for live metrics.

---

**Built with ❤️ for IBM Costa Rica**

**Methodology:** [Centaur Agent](knowledge/CHRONICLE.md) — Systematic development through documentation, auditing, and continuous improvement.
