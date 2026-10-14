# Supplier Payment Global V1 — Diagnostic V5

## Status
- Branch: `feature/supplier-payment-global-v1`
- Mode: **READ-ONLY**
- Function: `diagnosticSupplierPaymentQueriesV5()`
- Dependency: existing `sidRetailQuery(sql)`
- No payment-write logic, schema mutation, production edit, or deployment is included.

## Why V5 exists
V4 confirmed the known CAKRA invoice and its payment allocation, and exposed the columns in `return_pembelian`. However, the sample return rows were not enough to determine whether returns are applied to supplier debt. `potong_hutang_return` returned zero rows for the tested sample, which is not proof that it is unused.

## Queries
1. `CAKRA_RETURNS_RECENT`: recent return rows for CAKRA, with invoice and status references.
2. `CAKRA_RETURNS_USED_IN_DEBT`: CAKRA return rows marked `sdh_pake_di_trx_hutang = 'True'`.
3. `CAKRA_RETURNS_WITH_DEBT_REFERENCE`: CAKRA return rows where `no_hutang_dibayar` is populated.
4. `RECENT_CAKRA_ITEMHUTANG`: recent `itemhutang` rows, without JOINs.
5. `CAKRA_UNPAID_PURCHASES`: recent CAKRA purchase rows with a nonzero `hutang` field.

## Important caveats
- This diagnostic only runs SELECT queries. It does not write or change data.
- If the SQL gateway rejects `LIKE`, `<>`, or a filter expression, record the failure as a gateway/query-compatibility limitation; do not infer that the table or relationship is absent.
- The exact representation of zero may vary (for example `.00`, `0.00`, or numeric zero). If the unpaid-purchase query misses known rows, run a simpler supplier-only query and filter the returned rows in the diagnostic code instead.
- A `LIMIT` sample is not an exhaustive audit.
- Do not implement the payment writer until outstanding-balance semantics, return handling, cash posting, duplicate protection, and multi-row consistency are verified.

## Run instructions
In the Development GAS project, sync this branch's diagnostic file and run `diagnosticSupplierPaymentQueriesV5()`. Share the execution log and final result for analysis. Do not deploy to production.
