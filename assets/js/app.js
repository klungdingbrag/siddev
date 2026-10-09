import { APP_CONFIG } from "./config.js";
import { apiHealth } from "./api/client.js";
import { renderPiutangPage } from "./pages/piutang.js?v=20261006-piutang-current-1";
import { renderDashboardPage } from "./pages/dashboard.js?v=20261006-dashboard-current-1";
import { renderPelangganPage } from "./pages/pelanggan.js?v=20261006-customer-current-1";

const sidebar = document.querySelector("#sidebar");
const content = document.querySelector("#page-content");

const appFooter = document.createElement("footer");
appFooter.className = "app-footer";
appFooter.innerHTML = `<span>${APP_CONFIG.appName}</span><span>·</span><span>${APP_CONFIG.companyName}</span><span>·</span><strong>${APP_CONFIG.version}</strong>`;
document.querySelector(".app-shell")?.appendChild(appFooter);

const mobileHeader = document.createElement("header");
mobileHeader.className = "mobile-app-header";
mobileHeader.innerHTML = `
  <div class="mobile-app-brand">
    <button
      type="button"
      id="mobile-menu-toggle"
      class="mobile-menu-toggle"
      aria-label="Buka menu"
      aria-controls="sidebar"
      aria-expanded="false"
    ><span></span><span></span><span></span></button>
    <div class="mobile-app-brand-copy">
      <h1>NUSANTARA</h1>
      <span>Business Management</span>
    </div>
  </div>
`;
document.querySelector(".app-shell")?.insertBefore(mobileHeader, content);

function setMobileNav(open) {
  document.body.classList.toggle("mobile-nav-open", open);
  const menuButton = document.querySelector("#mobile-menu-toggle");
  const sidebar = document.querySelector("#sidebar");
  if (menuButton) menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  if (sidebar) sidebar.setAttribute("aria-hidden", open ? "false" : "true");
  const backdrop = document.querySelector("#mobile-nav-backdrop");
  if (backdrop) {
    backdrop.classList.toggle("is-visible", open);
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    backdrop.tabIndex = open ? 0 : -1;
  }
}

function closeMobileNav() {
  setMobileNav(false);
}

sidebar.innerHTML = `
  <div class="brand">
    <div class="brand-identity">
      <div class="brand-mark">SN</div>
      <div>
        <strong>SID Retail Pro</strong>
        <span>TB Nusantara</span>
      </div>
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
    <span class="status-dot" id="api-status-dot"></span>
    <span id="api-status">Checking API...</span>
    <button type="button" id="api-reconnect" class="api-reconnect hidden" aria-label="Reconnect API">↻ Reconnect</button>
  </div>
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
      render: () => renderPelangganPage()
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

  routeConfig.render();
  setActiveNav(routes[hash] ? hash : "#dashboard");
}

function initMobileNavigation() {
  const menuButton = document.querySelector("#mobile-menu-toggle");
  if (menuButton) {
    menuButton.addEventListener("click", () => {
      const isOpen = document.body.classList.contains("mobile-nav-open");
      setMobileNav(!isOpen);
    });
  }


  let backdrop = document.querySelector("#mobile-nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.id = "mobile-nav-backdrop";
    backdrop.className = "mobile-nav-backdrop";
    backdrop.setAttribute("aria-label", "Tutup menu");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.tabIndex = -1;
    document.body.appendChild(backdrop);
  }

  backdrop.addEventListener("click", closeMobileNav);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileNav();
    }
  });
}

window.addEventListener("hashchange", () => {
  closeMobileNav();
  route();
});

initMobileNavigation();
route();

function setApiStatus(label, state = "checking") {
  const status = document.querySelector("#api-status");
  const dot = document.querySelector("#api-status-dot");
  const reconnect = document.querySelector("#api-reconnect");

  if (status) status.textContent = label;
  if (dot) {
    dot.className = "status-dot status-" + state;
  }
  if (reconnect) {
    reconnect.classList.toggle("hidden", state !== "error");
    reconnect.disabled = state === "checking";
    reconnect.textContent = state === "checking" ? "↻ Checking..." : "↻ Reconnect";
  }
}

window.addEventListener("sid-api-success", (event) => {
  setApiStatus("API Online", "online");
  console.info("[API] success:", event.detail);
});

window.addEventListener("sid-api-failure", (event) => {
  setApiStatus("Request Error", "error");
  console.warn("[API] request failed:", event.detail);
});

async function checkApi() {
  setApiStatus("API Checking...", "checking");
  try {
    const data = await apiHealth();

    if (data?.status === "ok") {
      setApiStatus("API Online", "online");
    } else {
      setApiStatus("API Response", "error");
    }

    console.info("[API] health:", data);
    return data;
  } catch (error) {
    setApiStatus("API Error", "error");
    console.warn("[API] health check failed:", error);
    return null;
  }
}

document.querySelector("#api-reconnect").addEventListener("click", () => {
  checkApi();
});

checkApi();
