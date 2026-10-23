import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProfitDailyRows } from "../assets/js/pages/dashboard.js";

test("normalizes legacy DD/MM/YYYY dates and numeric values", () => {
  assert.deepEqual(
    normalizeProfitDailyRows([
      { tanggal: "05/10/2026", total_laba: "1250000" },
      { tanggal: "06/10/2026", total_laba: "1,500,000" }
    ]),
    [
      { tanggal: "2026-10-05", total_laba: 1250000 },
      { tanggal: "2026-10-06", total_laba: 1500000 }
    ]
  );
});

test("normalizes ISO date strings with a time suffix", () => {
  assert.deepEqual(
    normalizeProfitDailyRows([
      { tanggal: "2026-10-07T08:30:00", total_laba: 725000 }
    ]),
    [{ tanggal: "2026-10-07", total_laba: 725000 }]
  );
});

test("drops malformed dates and safely handles non-array input", () => {
  assert.deepEqual(
    normalizeProfitDailyRows([
      { tanggal: "tanggal-tidak-valid", total_laba: 10 },
      { tanggal: "", total_laba: 20 }
    ]),
    []
  );
  assert.deepEqual(normalizeProfitDailyRows(null), []);
});

test("invalid profit values normalize to zero", () => {
  assert.deepEqual(
    normalizeProfitDailyRows([{ tanggal: "2026-10-08", total_laba: "bukan-angka" }]),
    [{ tanggal: "2026-10-08", total_laba: 0 }]
  );
});
