import { APP_CONFIG } from "./config.js";
import { apiHealth } from "./api/client.js";
import { renderPiutangPage } from "./pages/piutang.js";
import { renderDashboardPage } from "./pages/dashboard.js";

const sidebar = document.querySelector("#sidebar");
const topbar = document.querySelector("#topbar");
const content = document.querySelector("#page-content");

sidebar.innerHTML = `
  <div class="brand">
    <div class="brand-mark">SN</div>
    <div>
      <strong>SID Retail Pro</strong>
      <span>TB Nusantara</span>
    </div>
  </div>

  <nav class="nav">
    <a class="nav-item active" href="#dashboard">Dashboard</a>
    <a class="nav-item" href="#pelanggan">Pelanggan</a>
    <a class="nav-item" href="#piutang">Piutang</a>
    <a class="nav-item" href="#barang">Data Barang</a>
    <a class="nav-item" href="#kalkulator">Kalkulator</a>
  </nav>

  <div class="sidebar-footer">
    <span class="status-dot"></span>
    <span id="api-status">Checking API...</span>
  </div>
`;

topbar.innerHTML = `
  <div>
    <p class="eyebrow">TB Nusantara</p>
    <h1>Dashboard</h1>
  </div>
  <div class="environment-badge">${APP_CONFIG.environment}</div>
`;

content.innerHTML = `
  <section class="welcome-card">
    <div>
      <p class="eyebrow">SID Retail Pro</p>
      <h2>Frontend baru sedang disiapkan.</h2>
      <p>
        Struktur aplikasi sudah terpisah dari backend GAS.
        Tahap berikutnya adalah menghubungkan halaman dengan API V1.
      </p>
    </div>
  </section>

  <section class="card-grid">
    <article class="stat-card">
      <span>API</span>
      <strong id="api-card-status">Checking...</strong>
      <small>Development backend</small>
    </article>
    <article class="stat-card">
      <span>Environment</span>
      <strong>${APP_CONFIG.environment}</strong>
      <small>Production belum disentuh</small>
    </article>
    <article class="stat-card">
      <span>Version</span>
      <strong>Frontend V1</strong>
      <small>API contract V1</small>
    </article>
  </section>
`;

function setActiveNav(hash) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("href") === hash);
  });
}

function route() {
  const hash = window.location.hash || "#dashboard";
  const title = hash === "#piutang" ? "Piutang Pelanggan" : "Dashboard";
  document.querySelector(".topbar h1").textContent = title;
  if (hash === "#piutang") {
    renderPiutangPage();
  } else {
    renderDashboardPage();
  }
  setActiveNav(hash);
}

window.addEventListener("hashchange", route);
route();

async function checkApi() {
  const status = document.querySelector("#api-status");
  const card = document.querySelector("#api-card-status");

  try {
    const data = await apiHealth();
    const online = data?.status === "ok";

    status.textContent = online ? "API Online" : "API Response";
    card.textContent = online ? "ONLINE" : "READY";
  } catch (error) {
    status.textContent = "API Offline";
    card.textContent = "OFFLINE";
    console.warn(error);
  }
}

checkApi();
