# Dashboard V3 — Design Contract

**Branch:** `ui/ux-polish-v3`  
**Baseline:** `855992dd340720695a7abb164d06fa77110b2488`  
**Status:** Approved design contract — implementation begins incrementally

## 1. Purpose

Dashboard V3 is a visual and structural refinement of the existing Dashboard. It is not a redesign from zero and must not alter accounting logic, API contracts, or source-of-truth definitions.

The target is an executive-style dashboard that answers the most important operational questions quickly:

1. How much is sales?
2. How much is profit?
3. How much receivable is outstanding?
4. How many transactions occurred?
5. How did daily sales/profit move?

## 2. Visual hierarchy

Priority order:

1. Omzet Penjualan
2. Laba Bulanan
3. Piutang Berjalan
4. Transaksi
5. Omzet Harian
6. Laba Harian
7. Kalender Operasional
8. Source of Truth

The Dashboard should feel compact rather than vertically oversized. Information density should increase through hierarchy and spacing discipline, not by adding more widgets.

## 3. Composition

### Header

Keep the page heading compact, with period selectors and Refresh action aligned as one toolbar.

### KPI

Use four compact KPI cards:

- Omzet Penjualan — primary financial emphasis
- Laba Bulanan — financial/profit emphasis
- Transaksi — neutral operational metric
- Piutang Berjalan — neutral/attention metric

### Sales section

Desktop composition:

- Omzet Harian: approximately 70% width
- Kalender Operasional: approximately 30% width

Omzet Harian is the dominant visual element, but should be wider and shorter rather than excessively tall.

### Profit section

Desktop composition:

- Laba Bulanan: approximately 50%
- Laba Harian: approximately 50%

### Data definition

Source of Truth remains available but has lower visual priority and should use shorter vertical space.

## 4. Responsive contract

### Desktop — >= 1200px

- KPI: 4 columns
- Sales: 70/30 composition
- Profit: 50/50 composition
- Source of Truth: full width
- No unnecessary vertical whitespace

### Tablet — 768–1199px

- KPI: 2 × 2
- Main chart sections: single column when two-column layout becomes cramped
- Preserve readable chart labels and interaction areas

### Mobile — 360–430px

- KPI: 2 × 2
- Main sections: single column
- No horizontal scrolling
- Chart and tooltip interaction must remain usable within viewport width
- Refresh action must remain obvious and touch-friendly

## 5. Refresh/loading interaction contract

The Refresh button is an important feedback point because Dashboard requests can take several seconds.

When loading:

- button becomes disabled to prevent duplicate requests;
- button keeps its physical size to avoid layout shift;
- a small, smooth rotating refresh/loading indicator is shown;
- label changes to a calm loading state such as `Memuat…`;
- animation must be subtle, not distracting;
- dashboard-level loading feedback remains visible;
- after success or failure, the button returns to its normal state.

The preferred interaction is **motion + stable layout**, not an aggressive full-button spinner or flashing effect.

Respect `prefers-reduced-motion`: animation must stop for users who request reduced motion.

## 6. Architecture boundary

Long-term conceptual structure:

```
Dashboard
├── Header
├── KPI Section
├── Sales Section
│   ├── Daily Sales Chart
│   └── Calendar
├── Profit Section
│   ├── Monthly Profit
│   └── Daily Profit
└── Data Definition
```

Potential code extraction:

```
pages/dashboard.js
  -> state/orchestration
  -> dashboard components
      -> KPI
      -> Calendar
      -> SalesChart
      -> ProfitChart
      -> ProfitDailyChart
      -> SourceOfTruth
  -> formatters/utils
```

Extraction is incremental. No abstraction is created merely to make the folder structure look cleaner.

## 7. CSS ownership

- `assets/css/app.css`: application foundation, layout, dashboard structural geometry.
- `assets/css/ui-polish.css`: visual refinement, interaction polish, loading animation and design-system refinement.
- Avoid adding page-specific visual rules to unrelated global sections.

## 8. Business safety boundary

V3 must preserve:

- accounting calculations;
- Piutang aging;
- Collection Priority;
- API contracts;
- SID Retail source-of-truth definitions;
- production GAS behavior;
- locked Piutang scope.

Any visual implementation must be behaviorally read-only against these contracts.

## 9. Implementation workflow

```
AUDIT
  ↓
DESIGN CONTRACT
  ↓
SMALL IMPLEMENTATION
  ↓
VISUAL / FUNCTIONAL TEST
  ↓
REVIEW
  ↓
DOCUMENT
  ↓
COMMIT / PR
  ↓
MAIN
  ↓
NEW BASELINE
```

Each meaningful step should be isolated in a reviewable commit so rollback remains simple.
