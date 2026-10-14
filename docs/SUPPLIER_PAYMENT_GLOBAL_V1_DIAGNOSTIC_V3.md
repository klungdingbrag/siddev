# Supplier Payment Global V1 — Diagnostic V3

## Status
- Development diagnostic only.
- Read-only: SELECT statements only; no INSERT, UPDATE, DELETE, schema changes, or deployment.
- Branch: `feature/supplier-payment-global-v1`.

## Why V3 exists
Diagnostic V2 successfully read transaction headers and purchase balances, but its JOIN between `hutang` and `itemhutang` timed out with HTTP 504. V3 therefore queries each table/key independently to reduce query complexity and isolate the failing path.

## Run
Run `diagnosticSupplierPaymentQueriesV3()` in the Development GAS project after syncing this branch's code file. It requires the existing `sidRetailQuery(sql)` helper. Do not run against production.

## Queries
1. `ITEMHUTANG_SAMPLE`: confirms allocation table columns and row shape.
2. `ITEMHUTANG_FOR_CAKRA_PAYMENT`: checks allocation rows for known header `R32-141026025`.
3. `ITEMHUTANG_FOR_SAMPLE_INVOICE`: checks allocation rows referencing legacy screenshot invoice `R21-270826003`.
4. `CAKRA_PURCHASE_SAMPLE`: reads CAKRA purchase invoices in date order, including current `hutang`.
5. `CAKRA_PAYMENT_HEADERS`: reads CAKRA payment headers without JOIN.

## Safety and interpretation
- A successful empty result means only that this exact query returned no rows; it does not prove a table/key is unused.
- If a query fails, record the specific query name, HTTP status, and error. Do not infer that the table is missing from a timeout.
- The V2 JOIN failure does not yet prove the relationship between `hutang.kode` and `itemhutang.kode`.
- Do not implement payment writes until we understand allocation rows, how `pembelian.hutang` is updated, cash posting, return/credit offsets, reference generation, and duplicate/retry behavior.
- No production code or deployment is changed by this diagnostic.
