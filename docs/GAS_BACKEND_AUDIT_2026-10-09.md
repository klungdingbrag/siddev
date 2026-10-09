# GAS Backend Audit — 2026-10-09

## Scope

Audit of the uploaded GAS snapshot `v12uiux-polish-v3.zip`, compared against branch `ui/ux-polish-v3`.

Uploaded production snapshot:
- `Code.gs`
- `Customer_API_V1.gs`
- `Dashboard_Analytics_V1.gs`
- `Production_Tabungan_V1.gs`
- `Supplier_Hutang_Audit_V1.gs`

Audit principle:
- Treat the uploaded GAS files as the current backend ground truth.
- Do not delete or alter production functions during the audit.
- Separate production, cleanup candidates, legacy/review items, diagnostics, and planned new API.
- Database/business contracts are not changed by this audit.

## Executive conclusion

The uploaded GAS snapshot is materially aligned with the current `ui/ux-polish-v3` branch for the five audited GAS files.

The most important architectural finding is that `Code.gs` is carrying three different responsibilities:

1. Production runtime and HTTP/API dispatch.
2. Stable Piutang/PDF business logic.
3. Historical diagnostic/test utilities.

This does not mean `Code.gs` is currently broken. It means cleanup should be incremental and dependency-driven.

## File classification

### KEEP / PRODUCTION

#### Code.gs
Keep:
- `SID_CONFIG`
- `validateConfig()`
- `getApiKey()`
- `generateTrxCode()`
- `sidRetailQuery()`
- Piutang production functions used by the current API
- Customer contact/detail functions used by production flows
- date/money parsing helpers used by production flows
- stable PDF generators currently exposed through API V1
- API V1 request parsing/response/dispatch
- `serverHealth()`
- `doGet()` / `doPost()`

#### Customer_API_V1.gs
Keep as production:
- `customerSqlQuoteV1()`
- `getPelangganAktifFinansialSemuaV1()`
- `getPelangganDetailV1()`
- `getRiwayatTabunganPelangganV1()`

#### Dashboard_Analytics_V1.gs
Keep as production:
- `getDashboardSalesDaily_V1()`
- `getDashboardProfitMonthly_V1()`
- `getDashboardProfitDaily_V1()`
- `getDashboardSummary_V1()`
- supporting validation/normalization/query helpers

#### Production_Tabungan_V1.gs
Keep as production:
- `tabunganV1SqlEscape_()`
- `getSaldoTabunganPelanggan()`

#### Supplier_Hutang_Audit_V1.gs
Keep temporarily as diagnostic source until the Hutang production API contract is finalized and documented.

## CLEANUP CANDIDATES

### Code.gs — historical diagnostics

The following are not part of the normal API dispatch contract and should be reviewed for extraction/removal after confirming no external/manual workflow still depends on them:

- `diagnosticCustomerDetailV3()`
- its local statistical helpers:
  - `sum()`
  - `average()`
  - `sorted()`
  - `median()`
  - `countOver()`
  - `stats()`

There are also extensive historical Stage 6/PDF implementation generations in `Code.gs`. They must NOT be deleted blindly because some versions are still reachable from API V1.

## LEGACY / REVIEW

The following area requires deliberate review rather than immediate deletion:

- Stage 6 / 6B / 6C / 6D / 6D.1 / 6D.2 PDF implementations.
- Older Piutang PDF builders that remain in the file because API V1 still exposes some of them.
- `doGetLegacyHtml_()` and `include()`, because `doGet()` intentionally preserves the no-action legacy HTML route.
- `getNotaTransaksiUntukPiutangPdf()` and related 6D.1/6D.2 helpers.
- PDF transport fingerprint wrapper `apiV1Pdf6D2WithFingerprint_()`: diagnostic in purpose, but currently reachable through API action `pdfSemuaDetailPiutang6D2`, so it cannot be treated as dead code yet.

## DIAGNOSTIC / TEMPORARY

### Supplier_Hutang_Audit_V1.gs

The file contains 20 audit functions created during the Hutang Supplier investigation.

The audit established strong evidence that:
- current supplier payable balance is represented by `pembelian.hutang`;
- supplier filtering uses `pembelian.hutang_ke = 'supplier'`;
- outstanding rows use `pembelian.hutang > 0`;
- supplier totals can be aggregated with `SUM(pembelian.hutang)`;
- `itemhutang` is useful for payment/allocation tracing;
- `supplier.saldo_piutang` must not be assumed to be supplier payable.

The diagnostic functions should remain until the production Hutang API is implemented and its contract is documented. After that, the file can be archived/removed from the production GAS project if no further diagnostics are required.

## NEW — planned

Create an isolated production file:

`code/Supplier_Hutang_API_V1.gs`

Initial production contract should be based on the audited source:

### Supplier list
- supplier code
- supplier name
- number of outstanding purchase invoices
- total outstanding payable

Core source:

`pembelian.hutang`

Core filter:

- `pembelian.hutang_ke = 'supplier'`
- `pembelian.hutang > 0`

### Supplier detail

Initial detail contract should expose:
- purchase invoice number
- invoice date
- invoice total
- current outstanding balance
- status

Payment-history/detail allocation should only be added after its exact business contract is explicitly defined.

## Important safety findings

1. Do not use `supplier.saldo_piutang` as the Hutang Supplier source without separate evidence.
2. Do not recalculate current payable balance from `itemhutang` when `pembelian.hutang` already represents the maintained balance.
3. Do not remove historical PDF functions until API dispatch reachability is checked.
4. Do not modify Piutang accounting/aging logic as part of Hutang cleanup.
5. Do not expose arbitrary SQL through the new public endpoint.
6. Do not mix Hutang production code into `Code.gs` before the isolated API is tested.

## Recommended cleanup sequence

```
AUDIT SNAPSHOT
    ↓
DOCUMENT FINDINGS
    ↓
CREATE Supplier_Hutang_API_V1.gs
    ↓
TEST ISOLATED API
    ↓
CONNECT DISPATCHER
    ↓
FRONTEND TEST
    ↓
ARCHIVE/REMOVE COMPLETED DIAGNOSTICS
    ↓
FINAL BACKEND BASELINE
```

## Current status

Audit completed for the uploaded five-file GAS snapshot.

No production code was changed by this audit.

Next implementation step:
1. finalize the Supplier Hutang V1 API contract;
2. create `Supplier_Hutang_API_V1.gs` in isolation;
3. test it against the audited SID Retail source;
4. only then integrate it into `Code.gs` dispatch;
5. perform diagnostic cleanup after successful production verification.
