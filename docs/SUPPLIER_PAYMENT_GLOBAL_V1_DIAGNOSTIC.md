# Supplier Payment Global V1 — Diagnosis

## Status
Diagnostic preparation only. No payment-write function has been implemented, and no deployment has been performed.

## Branch
`feature/supplier-payment-global-v1`

## Change recorded
- Added `code/Supplier_Payment_Global_Diagnostic_V1.gs`.
- Added one read-only diagnostic function: `diagnosticSupplierPaymentTablesV1()`.
- The function issues only `SELECT * ... LIMIT 3` against a fixed allowlist of candidate tables:
  - `hutang`
  - `itemhutang`
  - `pembelian`
  - `supplier`
  - `return_pembelian`
  - `potong_hutang_return`
- It logs API status, sample column names, up to three sample rows, and errors per table.
- It does not register a frontend API action and does not insert, update, or delete records.

## Safety and limitations
- This diagnostic must only be run in the GAS Development project connected to the development backend.
- It requires the existing `sidRetailQuery()` function in that GAS project.
- Table names are diagnostic candidates, not proof of the payment data contract.
- A successful query and sample output must be reviewed before writing any transaction function.
- `SELECT * LIMIT 3` can expose sample business data in execution logs; review and redact sensitive fields before sharing logs.
- No existing production/stable source files were edited.

## Next diagnostic stage
Review the output to establish:
1. Which table stores payment transaction headers.
2. Which fields represent reference number, date, supplier, cash code, amount, notes, and operator.
3. How payment allocation rows refer to the payment and purchase invoice.
4. How `pembelian.hutang` changes after allocation.
5. Whether returns and cash ledger entries affect the payable calculation.
6. Whether the query backend supports safe writes, atomicity, and duplicate-request protection.

Do not implement the write path until these relationships are verified from actual development data and the existing backend contract.
