# Supplier Payment Global V1 — Diagnostic V7

## Status
- Branch: `feature/supplier-payment-global-v1`
- Mode: **READ-ONLY**
- Function: `diagnosticSupplierPaymentQueriesV7()`
- No payment-write logic, schema mutation, production edit, or deployment is included.
- Return processing is excluded; it remains the responsibility of the POS server.

## V6 observations from Development
Execution on 2026-10-15 returned API status `success` for all three V6 queries:

- `hutang`: 20 rows with columns `kode, tanggal, supplier, alamat, jumlah, kode_kas, ket, operator, pr, transaksi`. The displayed sample contained R32 codes and `transaksi = HUTANG SUPPLIER`, but the unordered LIMIT sample showed 2021 records.
- `itemhutang`: 50 rows with columns `kode, kode_hutang, tgl_hutang, jumlah_hutang, return, jumlah`. The sample shows an R32 payment code and an R21 invoice code in separate fields, but this alone does not prove that a matching `hutang` header exists or that allocation totals reconcile.
- `pembelian`: 100 rows with columns `kode, tanggal, supplier, jumlah, hutang, lunas, jenis, hutang_ke`, ordered by invoice date and code. The LIMIT was reached; this is a FIFO sample, not the full outstanding invoice set.
- Apps Script logging truncated the large purchase result. The row count and columns are visible, but the sample is not complete in the pasted log.

These observations support further reconciliation only. They do not establish the supported write mechanism, cash posting, atomicity, or idempotency.

## Purpose of V7
V7 uses five payment codes and eleven invoice codes present in the V6 allocation sample to check whether:
1. matching `hutang` payment headers exist;
2. `itemhutang` rows reference those payment codes and invoice codes;
3. the sum of `itemhutang.jumlah` for each payment matches `hutang.jumlah`;
4. the referenced purchase invoices exist and expose their current `pembelian.hutang` balances.

The reconciliation compares amounts to the cent. V7 reads but does not modify records. It does not use the `itemhutang.return` field or query any return table.

## How to run
1. Sync this file from the feature branch into the Development GAS project.
2. Run `diagnosticSupplierPaymentQueriesV7()`.
3. Review each query's `success`, returned rows, and `payment_reconciliation`.
4. Share the final result for analysis. If Apps Script truncates it, share the three individual query logs and the reconciliation section.

Do not run feature experiments against Production.

## Interpretation limits
- These are fixed-code samples from the V6 output, not a complete history or guarantee those records still exist.
- A missing header or invoice may reflect sample/database differences or query compatibility; investigate before inferring absence.
- A matching total is evidence of a relationship for these samples only. It is not proof of transaction atomicity or an approved write API.
- V7 does not determine how `pembelian.hutang` and `pembelian.lunas` are changed during a payment.

## Next gate
Do not implement the writer until the sample relationship is understood and the Development write mechanism, duplicate protection, and partial-failure behavior are verified.
