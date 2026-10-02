import { APP_CONFIG } from "./config.js";
import { apiHealth } from "./api/client.js";
import { renderPiutangPage } from "./pages/piutang.js?v=20260930-pdf-transport-5";
import { renderDashboardPage } from "./pages/dashboard.js?v=20261002-dashboard-v4";

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
    <a class="nav-item" href="#dashboard">Dashboard</a>
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

function setActiveNav(hash) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("href") === hash);
  });
}

function renderComingSoonPage(title, description) {
  content.innerHTML = `
    <section class="welcome-card">
      <div>
        <p class="eyebrow">SID Retail Pro</p>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
    </section>
  `;
}

function route() {
  const hash = window.location.hash || "#dashboard";
  const titleElement = document.querySelector(".topbar h1");

  const routes = {
    "#dashboard": {
      title: "Dashboard",
      render: () => renderDashboardPage()
    },
    "#piutang": {
      title: "Piutang Pelanggan",
      render: () => renderPiutangPage()
    },
    "#pelanggan": {
      title: "Pelanggan",
      render: () => renderComingSoonPage(
        "Pelanggan",
        "Modul Pelanggan belum diaktifkan. Halaman ini tidak menjalankan request Dashboard."
      )
    },
    "#barang": {
      title: "Data Barang",
      render: () => renderComingSoonPage(
        "Data Barang",
        "Modul Data Barang belum diaktifkan. Halaman ini tidak menjalankan request Dashboard."
      )
    },
    "#kalkulator": {
      title: "Kalkulator",
      render: () => renderComingSoonPage(
        "Kalkulator",
        "Modul Kalkulator belum diaktifkan. Halaman ini tidak menjalankan request Dashboard."
      )
    }
  };

  const routeConfig = routes[hash] || routes["#dashboard"];

  if (titleElement) {
    titleElement.textContent = routeConfig.title;
  }

  routeConfig.render();
  setActiveNav(routes[hash] ? hash : "#dashboard");
}

window.addEventListener("hashchange", route);
route();

async function checkApi() {
  try {
    const data = await apiHealth();
    const online = data?.status === "ok";

    const status = document.querySelector("#api-status");
    if (status) {
      status.textContent = online ? "API Online" : "API Response";
    }

    console.info("[API] health:", data);
  } catch (error) {
    const status = document.querySelector("#api-status");
    if (status) {
      status.textContent = "API Offline";
    }

    console.warn("[API] health check failed:", error);
  }
}

checkApi();
