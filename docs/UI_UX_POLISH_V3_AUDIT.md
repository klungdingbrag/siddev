# UI/UX Polish V3 — Audit & Architecture Plan

**Branch:** `ui/ux-polish-v3`  
**Baseline:** `855992dd340720695a7abb164d06fa77110b2488`  
**Status:** AUDIT COMPLETED — IMPLEMENTATION NOT STARTED

## 1. Audit Objective

V3 is not a redesign from zero. The objective is to make SID Retail:

- more professional and visually consistent,
- cleaner and more comfortable to use,
- more compact where information density is appropriate,
- easier to maintain,
- easier to understand when features are added or changed,
- structurally clearer as a real application architecture.

The audit covers both **frontend UX/UI** and **code organization**.

## 2. Current Architecture

Current frontend structure:

```
index.html
   |
   v
assets/js/app.js
   |
   +-- assets/js/api/
   |      +-- client.js
   |      +-- endpoints.js
   |
   +-- assets/js/pages/
   |      +-- dashboard.js
   |      +-- pelanggan.js
   |      +-- piutang.js
   |
   +-- assets/js/ui-polish.js
   |
   +-- assets/js/components/
          (currently reserved / empty)
```

CSS is currently concentrated mainly in:

```
assets/css/app.css
assets/css/ui-polish.css
```

Backend source is separated under:

```
code/
├── Code.gs
├── Customer_API_V1.gs
├── Dashboard_Analytics_V1.gs
└── Production_Tabungan_V1.gs
```

This separation is already a good foundation: API transport, endpoint mapping, page modules, and GAS source are distinguishable.

## 3. Architecture Findings

### A. Good foundation

1. Page modules already exist instead of putting all UI logic in `app.js`.
2. API transport is separated from endpoint definitions.
3. Dashboard analytics has its own GAS module.
4. Customer API has its own GAS module.
5. Production Tabungan logic is isolated.
6. Existing README already records important business/data contracts and baseline discipline.
7. Piutang has an explicit locked/final checkpoint and must remain protected during V3.

### B. Structural debt

#### 1. `dashboard.js` is too large

Dashboard currently combines:

- state,
- cache,
- normalization,
- HTML shell,
- calendar rendering,
- chart rendering,
- tooltip interaction,
- reconciliation,
- KPI rendering,
- loading/error handling,
- API orchestration.

This is workable now but will become difficult to maintain as Dashboard grows.

**Recommendation:** do not rewrite immediately. First stabilize V3 visual behavior, then gradually extract reusable dashboard concerns into small modules/components.

Target direction:

```
pages/dashboard.js
    |
    +-- dashboard state
    +-- dashboard orchestration
    |
    +-- dashboard components
    |      +-- KPI
    |      +-- Calendar
    |      +-- SalesChart
    |      +-- ProfitChart
    |      +-- ProfitDailyChart
    |      +-- SourceOfTruth
    |
    +-- dashboard formatters/utils
```

Extraction should happen only when the boundary is clear and tested.

#### 2. `app.js` remains an application shell

`app.js` should progressively remain responsible for:

- application bootstrap,
- routing,
- global navigation,
- global API status,
- global shell behavior.

Page-specific business/UI logic should stay inside page modules.

#### 3. Components directory is currently unused

`assets/js/components/` exists but contains only `.gitkeep`.

This is not a problem by itself. It is better to have an empty directory than to create abstractions without a real need.

For V3, components should be introduced only for genuinely reusable UI patterns, for example:

- loading state,
- empty state,
- error state,
- modal shell,
- button/action primitives,
- KPI card,
- chart shell.

Avoid creating a component framework inside the project.

#### 4. CSS ownership needs clearer boundaries

Current CSS is concentrated in two large files.

Recommended rule:

- `app.css` = application foundation, layout, global primitives.
- `ui-polish.css` = temporary/visual refinement layer only.
- Future page-specific styles should be grouped clearly and named by module.
- Avoid repeatedly appending unrelated fixes to the end of a global stylesheet.

The goal is not to split CSS into dozens of files. The goal is **clear ownership**.

## 4. Dashboard UX Audit

### Current strengths

- Strong information hierarchy through KPI cards.
- Omzet, laba, transaksi and piutang are immediately visible.
- Daily sales chart has interaction/tooltip.
- Daily profit chart has reconciliation information.
- Calendar provides operational context.
- Source-of-truth panel is useful for internal transparency.
- Existing visual identity is consistent with the rest of SID Retail.

### Main UX problem

The Dashboard currently has too much vertical space in some chart compositions.

The largest concern is the Omzet Harian area.

Contributing structural factors include:

- chart grid spanning,
- minimum chart wrapper heights,
- fixed SVG/chart heights,
- panel header minimum height,
- multiple dashboard panels trying to establish their own vertical rhythm.

This makes the dashboard feel less dense than an executive operational dashboard should be.

### V3 target

The dashboard should feel:

**compact → clear → actionable → calm**

not:

**large → decorative → empty**

## 5. Proposed Dashboard Information Hierarchy

Priority:

1. Omzet Penjualan
2. Laba Bulanan
3. Piutang Berjalan
4. Transaksi
5. Omzet Harian
6. Laba Harian
7. Operational calendar
8. Data definition / source of truth

The dashboard should communicate the business situation within a few seconds.

## 6. Responsive Audit Target

V3 must be reviewed at:

- 360px
- 390px
- 430px
- 768px
- 1024px
- 1366px
- 1920px

Important checks:

- no accidental horizontal overflow,
- no excessive empty space,
- readable typography,
- touch targets remain comfortable,
- chart interaction remains usable,
- cards do not become unnecessarily tall,
- table/card transitions remain consistent.

## 7. UX Consistency Target

The following should use consistent visual rules:

- page headings,
- eyebrow labels,
- buttons,
- cards,
- panel headers,
- table actions,
- modal actions,
- loading states,
- empty states,
- error states,
- status indicators,
- spacing,
- border radius,
- shadows,
- typography.

A user should feel that Dashboard, Pelanggan and Piutang belong to the same application.

## 8. Code Quality Target

V3 code changes should follow:

```
ONE RESPONSIBILITY
      ↓
CLEAR MODULE
      ↓
CLEAR NAMING
      ↓
NO DUPLICATION
      ↓
NO HIDDEN SIDE EFFECT
      ↓
DOCUMENT IMPORTANT CONTRACT
```

Avoid:

- giant functions,
- unexplained magic numbers,
- duplicated event listeners,
- inline styles when reusable CSS is appropriate,
- page logic leaking into global shell code,
- UI changes that silently alter business logic,
- refactors without a concrete maintenance benefit.

## 9. Business Safety Boundary

V3 is primarily a frontend/UI/architecture polish initiative.

Do NOT change without explicit audit and approval:

- accounting logic,
- Piutang aging rules,
- Collection Priority logic,
- API contracts,
- SID Retail source-of-truth definitions,
- production GAS behavior,
- Piutang locked scope.

A UI improvement must not accidentally become a business-logic change.

## 10. Documentation Discipline

Every meaningful V3 change must be recorded in:

1. commit history,
2. README when it changes architecture, behavior, baseline, or development rules,
3. dedicated `docs/` notes when the change requires detailed technical explanation.

Recommended documentation pattern:

```
README.md
    |
    +-- current architecture
    +-- current branch/baseline
    +-- important contracts
    +-- development discipline
    +-- major UI/UX milestones
    |
docs/
    |
    +-- detailed audit
    +-- implementation notes
    +-- recovery / technical decisions
```

The README should remain understandable without becoming a dump of every CSS adjustment.

## 11. V3 Implementation Phases

### Phase 1 — Dashboard composition
- compact vertical rhythm,
- remove excessive empty space,
- improve chart sizing,
- improve panel relationships,
- preserve existing data.

### Phase 2 — Dashboard responsive
- mobile/desktop refinement,
- chart interaction,
- calendar,
- KPI density.

### Phase 3 — Cross-page consistency
- buttons,
- cards,
- typography,
- modal,
- loading/error/empty states.

### Phase 4 — Architecture refinement
- extract only proven reusable components,
- clarify CSS ownership,
- reduce page-module complexity where justified.

### Phase 5 — QA and review
- desktop,
- tablet,
- mobile,
- API failure states,
- loading states,
- modal interactions,
- Piutang regression check.

### Phase 6 — Documentation and release
- update README,
- update detailed docs,
- commit,
- review diff,
- create PR,
- only then consider merge to `main`.

## 12. Current Audit Decision

**No production/business logic is changed by this audit.**

The first implementation target is Dashboard composition.

The architectural cleanup will be **incremental**, not a risky rewrite.

> The objective is to make the codebase easier to evolve, not merely prettier today.
