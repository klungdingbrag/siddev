// Calendar renderer. Period state, normalized data, and shared formatting remain in dashboard.js.

export function renderDashboardCalendar(rows, period, helpers) {
  const { year, month } = period;
  const { pad2, monthLabel, escapeHtml, formatRupiah } = helpers;
  const container = document.querySelector("#dashboard-calendar");
  if (!container) return;

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const salesByDay = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => {
      const date = row.date instanceof Date && !Number.isNaN(row.date.getTime())
        ? `${row.date.getFullYear()}-${pad2(row.date.getMonth() + 1)}-${pad2(row.date.getDate())}`
        : row.tanggal;
      return [date, row];
    })
  );

  const today = new Date();
  const todayKey = today.getFullYear() === year && today.getMonth() + 1 === month
    ? `${year}-${pad2(month)}-${pad2(today.getDate())}`
    : "";

  const cells = [];
  for (let index = 0; index < startOffset; index += 1) {
    cells.push('<div class="dashboard-calendar-day is-empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad2(month)}-${pad2(day)}`;
    const row = salesByDay.get(key) || salesByDay.get(`${day}/${pad2(month)}`);
    const hasData = Boolean(row);
    const isToday = key === todayKey;
    cells.push(`
      <button
        class="dashboard-calendar-day${hasData ? " has-data" : ""}${isToday ? " is-today" : ""}"
        type="button"
        data-calendar-date="${escapeHtml(key)}"
        aria-label="${escapeHtml(`${day} ${monthLabel(month)} ${year}`)}"
      >
        <span class="dashboard-calendar-number">${day}</span>
        ${hasData ? '<span class="dashboard-calendar-dot"></span>' : ""}
      </button>
    `);
  }

  container.innerHTML = `
    <div class="dashboard-calendar-head">
      <div>
        <span class="dashboard-panel-eyebrow">Kalender Operasional</span>
        <h3>${escapeHtml(monthLabel(month))} ${year}</h3>
      </div>
      <div class="dashboard-calendar-legend">
        <span><i></i> Ada transaksi</span>
      </div>
    </div>
    <div class="dashboard-calendar-weekdays">
      ${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="dashboard-calendar-grid">
      ${cells.join("")}
    </div>
    <div class="dashboard-calendar-detail" id="dashboard-calendar-detail">
      <span>Pilih tanggal</span>
      <strong>Lihat omzet dan transaksi harian</strong>
    </div>
  `;

  container.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarDate;
      const row = salesByDay.get(key);
      container.querySelectorAll(".dashboard-calendar-day.is-selected").forEach((item) => {
        item.classList.remove("is-selected");
      });
      button.classList.add("is-selected");

      const detail = container.querySelector("#dashboard-calendar-detail");
      if (!detail) return;

      const day = Number(key.slice(-2));
      detail.innerHTML = row
        ? `<span>${escapeHtml(day + " " + monthLabel(month) + " " + year)}</span><strong>${escapeHtml(formatRupiah(row.total_omzet))}</strong><small>${row.jumlah_transaksi} transaksi</small>`
        : `<span>${escapeHtml(day + " " + monthLabel(month) + " " + year)}</span><strong>Tidak ada transaksi tercatat</strong><small>Belum ada data omzet pada tanggal ini.</small>`;
    });
  });
}

function normalizeProfitDailyRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    tanggal: String(row.tanggal || ""),
    total_laba: Number(row.total_laba || 0)
  }));
}

