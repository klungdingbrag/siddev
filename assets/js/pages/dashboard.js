export function renderDashboardPage() {
  const root = document.querySelector("#page-content");
  if (!root) return;

  root.innerHTML =
    '<section class="welcome-card">' +
      '<div>' +
        '<p class="eyebrow">SID Retail Pro</p>' +
        '<h2>Dashboard</h2>' +
        '<p>Gunakan menu di sebelah kiri untuk membuka modul. Modul Piutang terhubung ke Development backend.</p>' +
      '</div>' +
    '</section>' +
    '<section class="card-grid">' +
      '<article class="stat-card"><span>Backend</span><strong>Development</strong><small>API Contract V1</small></article>' +
      '<article class="stat-card"><span>Production</span><strong>Tidak disentuh</strong><small>Production tetap terpisah</small></article>' +
      '<article class="stat-card"><span>Modul</span><strong>Piutang</strong><small>Implementasi tahap pertama</small></article>' +
    '</section>';
}
