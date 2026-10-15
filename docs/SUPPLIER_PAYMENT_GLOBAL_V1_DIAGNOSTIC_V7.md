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


## V7 Development execution results — 2026-10-15

The three V7 queries returned API status `success`.

- All 5 sampled payment headers were found in `hutang`.
- All 11 sampled allocations were found in `itemhutang`.
- All 11 referenced invoice rows were found in `pembelian`.
- Each sampled header supplier matched the supplier on its referenced invoice rows.
- Every sampled invoice currently has `pembelian.hutang = .00` and `lunas = True`.
- The allocation total matched the payment header total for all 5 sampled payment codes.

| Payment code | Supplier | Header total | Allocation rows | Allocation total | Match |
|---|---|---:|---:|---:|---|
| R32-311225024 | REDO | 2,745,200.00 | 1 | 2,745,200.00 | Yes |
| R32-311225023 | NIPPONJB | 4,341,575.92 | 2 | 4,341,575.92 | Yes |
| R32-311225022 | RH | 3,051,117.00 | 3 | 3,051,117.00 | Yes |
| R32-311225021 | CAKRA | 5,000,000.00 | 1 | 5,000,000.00 | Yes |
| R32-310826032 | KAG | 2,628,000.00 | 4 | 2,628,000.00 | Yes |

### What this establishes
For these samples, `hutang.kode` matches `itemhutang.kode`; `itemhutang.kode_hutang` references `pembelian.kode`; and allocation amounts sum to the payment header amount. The existing read contract's use of current `pembelian.hutang` remains consistent with the sampled invoices' current fully-paid status.

### What remains unverified
- These samples do not show how the headers or allocations were written.
- All referenced invoices are currently fully paid, so the sample does not establish partial-payment update behavior.
- The sample does not establish FIFO allocation order at write time.
- No evidence was collected for cash-ledger effects, transaction atomicity, duplicate protection, or recovery after a partial write.
- V7 does not read return data or use return values in its calculations.

Do not treat the observed table relationship as permission to write directly to these tables. Continue the Development-only audit of the supported write mechanism before implementing a payment action.


## Follow-up source audit — payment write path

Read-only inspection of the uploaded GAS snapshot confirms:

- `doPost(e)` routes through the existing API V1 handler, and the handler can parse a JSON POST body.
- The current API dispatcher has read actions for supplier list/detail and supplier PDFs; no supplier payment write action was found.
- The current frontend API client sends GET requests and includes retry behavior for transient failures. A payment writer must use a dedicated no-blind-retry request path and server-side idempotency.
- `sidRetailQuery(sql)` sends the SQL string to an external SID Retail endpoint using HTTP GET. Its use for SELECT diagnostics does not prove that the external endpoint supports DML, transactions, atomic writes, or rollback.

Therefore the exact write route and supported transaction boundary remain unknown. No direct table write should be implemented until the SID Retail write contract or existing POS payment endpoint is inspected and verified.
