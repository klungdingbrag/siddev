import { apiRequest, apiRequestPost } from "./client.js?v=20261123-piutang-pdf-job-v1";

export const api = Object.freeze({
  health: () => apiRequest("health"),
  serverHealth: () => apiRequest("serverHealth"),
  validateConfig: () => apiRequest("validateConfig"),
  piutang: (params = {}) => apiRequest("piutang", params),
  supplierHutang: () => apiRequest("supplierHutang"),
  supplierHutangDetail: (kodeSupplier) =>
    apiRequest("supplierHutangDetail", { kode_supplier: kodeSupplier }),
  pdfSupplierHutangSummaryV1: (kodeSupplier) =>
    apiRequest("pdfSupplierHutangSummaryV1", { kode_supplier: kodeSupplier }),
  pdfSupplierHutangInvoiceV1: (kodeSupplier, kodeNota) =>
    apiRequest("pdfSupplierHutangInvoiceV1", {
      kode_supplier: kodeSupplier,
      kode_nota: kodeNota
    }),
  pelanggan: () =>
    apiRequest("pelanggan"),
  pelangganDetail: (kodePelanggan) =>
    apiRequest("pelangganDetail", { kode_pelanggan: kodePelanggan }),
  pelangganTabunganHistory: (kodePelanggan, limit = 100) =>
    apiRequest("pelangganTabunganHistory", {
      kode_pelanggan: kodePelanggan,
      limit
    }),
  pdfCustomerStatementV1: (kodePelanggan) =>
    apiRequest("pdfCustomerStatementV1", {
      kode_pelanggan: kodePelanggan
    }),
  dashboardSalesDaily: (tanggalAwal, tanggalAkhir) =>
    apiRequest("dashboardSalesDaily", { tanggalAwal, tanggalAkhir }),
  dashboardProfitMonthly: (tanggalAwal, tanggalAkhir) =>
    apiRequest("dashboardProfitMonthly", { tanggalAwal, tanggalAkhir }),
  dashboardProfitDaily: (tanggalAwal, tanggalAkhir) =>
    apiRequest("dashboardProfitDaily", { tanggalAwal, tanggalAkhir }),
  dashboardSummary: (tanggalAwal, tanggalAkhir) =>
    apiRequest("dashboardSummary", { tanggalAwal, tanggalAkhir }),
  customerPiutangDetail: (kodePelanggan) =>
    apiRequest("customerPiutangDetail", {
      kode_pelanggan: kodePelanggan
    }),
  tabungan: (kodePelanggan) =>
    apiRequest("tabungan", {
      kode_pelanggan: kodePelanggan
    }),
  pdfRingkasanPiutang: (params = {}) =>
    apiRequest("pdfRingkasanPiutang", params),
  pdfSemuaDetailPiutang6D1: (kodePelanggan) =>
    apiRequest("pdfSemuaDetailPiutang6D1", {
      kode_pelanggan: kodePelanggan
    }),
  pdfSemuaDetailPiutang6D2: (kodePelanggan, extra = {}) =>
    apiRequest("pdfSemuaDetailPiutang6D2", {
      kode_pelanggan: kodePelanggan,
      ...extra
    }),
  pdfPiutang6D2JobStart: (kodePelanggan, requestId) =>
    apiRequestPost("pdfPiutang6D2JobStart", {
      kode_pelanggan: kodePelanggan,
      request_id: requestId
    }),
  pdfPiutang6D2JobProcess: (jobId) =>
    apiRequestPost("pdfPiutang6D2JobProcess", { job_id: jobId }),
  pdfPiutang6D2JobStatus: (jobId) =>
    apiRequestPost("pdfPiutang6D2JobStatus", { job_id: jobId }),
  pdfInvoice: (kodeTransaksi) =>
    apiRequest("pdfInvoice", {
      kode_transaksi: kodeTransaksi
    })
});