# GAS Backend Cleanup — 2026-10-05

Branch: `cleanup/gas-production-2026-10-05`

Source audit:
- latest GAS deployment ZIP supplied for review
- production endpoints were kept
- obsolete tests/diagnostics were removed only when they were not dependencies of production routes

## Keep / copy to GAS

- `code/Code.gs`
- `code/Customer_API_V1.gs`
- `code/Dashboard_Analytics_V1.gs`
- `code/Production_Tabungan_V1.gs`

## Remove from GAS project

- `code/Diagnostic_Customer_Financial_Overlap_V1.gs`
- `code/Invoice_WhatsApp_V2.gs`
- `vik.gs` if it still exists in the GAS project

## Production API contract retained

`health`, `validateConfig`, `piutang`, `dashboardSalesDaily`, `dashboardSummary`, `dashboardProfitMonthly`, `customerPiutangDetail`, `pelanggan`, `pelangganDetail`, `pelangganTabunganHistory`, `tabungan`, `pdfRingkasanPiutang`, `pdfSemuaDetailPiutang6D1`, `pdfSemuaDetailPiutang6D2`, `pdfCustomerStatementV1`, `pdfInvoice`.

## Customer PDF

The Customer V1 PDF header is already included in the cleaned `Code.gs`:

TB NUSANTARA  
CV NUSANTARA BUILDING MATERIAL  
JL LINTAS SELATAN SELATAN SUROREJAN PURING  
081234563843

## Important

This branch is not the stable baseline. After copying the cleaned files into GAS, deploy and test the production endpoints first. Only after successful verification should this branch be considered for a new baseline.


## Final dependency audit

- `Diagnostic_Fika_Tabungan.gs` was removed after confirming it was one-off diagnostic code and was not used by production routes.
- Stage 6 production dependencies were explicitly rechecked.
- `validateStage6CustomerCode_`, `validateStage6TransactionCode_`, `getRingkasanPiutangPelanggan`, `stage6AgeLabel_`, and `inspectPdfBytes_` were retained/restored because active PDF code still references them.
- `apiV1Pdf6D2WithFingerprint_` and `apiV1Sha256Hex_` remain because the production `pdfSemuaDetailPiutang6D2` route calls the fingerprint wrapper.
- No removed test/diagnostic function remains as an active code dependency of the retained production functions.
- A syntax corruption in the cleanup branch (`on getSemuaNotaOutstanding(...)`) was restored to the original production declaration before finalizing the audit.

## Audit result

**CLEANUP AUDIT: PASS WITH PRODUCTION DEPENDENCY RESTORATION**

The branch is ready to be copied into the Development GAS project for deployment and smoke testing. Stable branch remains untouched.