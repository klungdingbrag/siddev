# Supplier Payment Global V1 — Diagnostic V6

## Status
- Branch: `feature/supplier-payment-global-v1`
- Mode: **READ-ONLY**
- Function: `diagnosticSupplierPaymentQueriesV6()`
- No payment-write logic, schema mutation, production edit, or deployment is included.
- Return tables and return-related fields are intentionally out of scope; returns are handled by the POS server.

## Purpose
Inspect Development SID Retail samples needed to continue the supplier payment write-path audit without assuming that any candidate table or field is the correct write contract.

## Queries
1. `PAYMENT_HEADER_TABLE_SAMPLE`: samples `hutang` to inspect available payment-header columns.
2. `PAYMENT_ALLOCATION_TABLE_SAMPLE`: samples `itemhutang` and its invoice-allocation columns.
3. `SUPPLIER_OUTSTANDING_PURCHASE_SAMPLE`: samples supplier invoices with positive `pembelian.hutang`, ordered by invoice date and then invoice code.

All SQL statements are fixed SELECT queries with limits. The diagnostic does not write data.

## How to run
1. Use the Development GAS project connected to the Development SID Retail backend.
2. Sync this file from the GitHub feature branch into that Development project.
3. Run `diagnosticSupplierPaymentQueriesV6()`.
4. Review the table columns, sample rows, API status, and any gateway errors before designing a writer.

Do not run this diagnostic against Production for feature experimentation.

## Interpretation limits
- A sample is not exhaustive and does not establish table ownership, accounting semantics, or a supported write API.
- A failed query can indicate SQL-gateway compatibility or permissions; it is not proof that a table or relationship is absent.
- The existing Supplier Hutang V1 read contract continues to use `pembelian.hutang` for current outstanding balances.
- `itemhutang` remains an observed allocation trace until the live write path and reconciliation behavior are verified.
- Return processing is outside this feature and must not be included in payment calculations.

## Snapshot-to-branch note
The uploaded Apps Script ZIP contains a file named `Supplier_Payment_Global_Diagnostic_V1.gs` whose function and contents are Diagnostic V5. The branch separately contains the original table-sampling V1 and the V5 query diagnostic. Diagnostic V6 is added as a new, correctly versioned file so the audit can proceed without replacing historical diagnostics.

## Next gate
Do not implement the payment writer until Development evidence establishes:
- payment header and allocation records for known successful payments;
- how those records correspond to changes in `pembelian.hutang` and `pembelian.lunas`;
- the supported server-side write mechanism;
- duplicate prevention and behavior after partial failure.
