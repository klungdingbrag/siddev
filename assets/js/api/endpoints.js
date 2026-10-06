import { apiRequest } from "./client.js";

export const api = Object.freeze({
  health: () => apiRequest("health"),
  validateConfig: () => apiRequest("validateConfig"),
  piutang: (params = {}) => apiRequest("piutang", params),
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
  pdfInvoice: (kodeTransaksi) =>
    apiRequest("pdfInvoice", {
      kode_transaksi: kodeTransaksi
    })
});
