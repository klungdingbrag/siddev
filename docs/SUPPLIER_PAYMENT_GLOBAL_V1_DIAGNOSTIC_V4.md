# Supplier Payment Global V1 — Diagnostic V4

## Status and safety
- Branch: `feature/supplier-payment-global-v1`
- Read-only, SELECT statements only.
- No INSERT, UPDATE, DELETE, schema changes, production changes, or deployment.
- Run `diagnosticSupplierPaymentQueriesV4()` only in GAS Development.
- Requires existing `sidRetailQuery(sql)`.

## Why V4
V3 confirmed the header/detail allocation pattern for payment `R32-141026025` and invoice `R21-270826003`. Its CAKRA purchase query was ordered oldest-first and limited to 30 rows, so it did not include that newer invoice. V4 reads the exact invoice and recent invoices, and inspects return-related tables independently.

## Queries
1. `EXACT_CAKRA_INVOICE`: exact purchase record for `R21-270826003`.
2. `RECENT_CAKRA_PURCHASES`: newest CAKRA purchase rows, including current `hutang`.
3. `RETURN_PURCHASE_SAMPLE`: actual columns and sample rows in `return_pembelian`.
4. `DEBT_RETURN_OFFSET_SAMPLE`: actual columns and sample rows in `potong_hutang_return`.
5. `ALLOCATIONS_FOR_CAKRA_INVOICE`: allocation history for the exact invoice, without JOIN.

## Interpretation guardrails
- A timeout/error is not proof of absent data or a missing table.
- An empty result is limited to the exact query and filters used.
- Do not infer balance update rules from allocation rows alone.
- Do not implement payment writes until purchase balance semantics, return/offset effects, cash posting, reference generation, and duplicate/retry handling are confirmed.
