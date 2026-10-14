# Supplier Payment Global V1 — Diagnostic V2

## Purpose
Follow up the V1 table-sampling run with focused, read-only queries. The purpose is to establish the existing data relationships before any payment-write function is implemented.

## Change record
- Added `code/Supplier_Payment_Global_Diagnostic_V2.gs`.
- Added `diagnosticSupplierPaymentQueriesV2()`.
- Commit: `42e07288f63e869498f574e1e3eae2aba704f07b`.
- No existing source file was edited.
- No frontend endpoint was added.
- No payment transaction was created and no deployment was performed.

## Queries
1. `HUTANG_TRANSACTION_TYPES`: counts rows by `hutang.transaksi`, avoiding an assumption about the transaction-type value.
2. `RECENT_HUTANG_HEADERS`: reads recent transaction headers.
3. `HUTANG_WITH_ALLOCATION`: checks the relationship between `hutang.kode` and `itemhutang.kode`, and shows invoice allocation fields.
4. `PURCHASE_OUTSTANDING_OLDEST`: samples purchase records with positive `pembelian.hutang`, ordered by date.
5. `SUPPLIER_OUTSTANDING_SAMPLE`: compares purchase supplier identifiers with the supplier master and aggregates recorded outstanding amounts.

## Safety
- All statements are SELECT-only.
- Run only against the Development backend.
- The SQL gateway's support for JOIN, GROUP BY, CAST, aliases, and aggregate expressions is not yet established. A failed query should be treated as a query/backend capability finding, not as proof that the underlying table or relationship does not exist.
- The query result can include supplier/business data; redact sensitive values before sharing logs.
- Do not implement the write path based solely on V2. Review actual output and verify balances and returns before deciding the authoritative outstanding-debt calculation.

## Next step
Run `diagnosticSupplierPaymentQueriesV2()` in the Development GAS project after syncing this branch through the existing workflow, then review each query's status and result.
