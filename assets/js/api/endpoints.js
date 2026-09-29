import { apiRequest } from "./client.js";

export const api = Object.freeze({
  health: () => apiRequest("health"),
  validateConfig: () => apiRequest("validateConfig"),
  piutang: (params = {}) => apiRequest("piutang", params),
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
  pdfSemuaDetailPiutang6D2: (kodePelanggan) =>
    apiRequest("pdfSemuaDetailPiutang6D2", {
      kode_pelanggan: kodePelanggan
    }),
  pdfInvoice: (kodeTransaksi) =>
    apiRequest("pdfInvoice", {
      kode_transaksi: kodeTransaksi
    })
});
