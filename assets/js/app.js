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

const mobileMenu = document.createElement("button");
mobileMenu.type = "button";
mobileMenu.id = "mobile-menu-toggle";
mobileMenu.className = "mobile-menu-toggle mobile-menu-toggle-floating";
mobileMenu.setAttribute("aria-label", "Buka menu");
mobileMenu.setAttribute("aria-controls", "sidebar");
mobileMenu.setAttribute("aria-expanded", "false");
mobileMenu.innerHTML = "<span></span><span></span><span></span>";
document.body.appendChild(mobileMenu);

function setMobileNav(open) {
  document.body.classList.toggle("mobile-nav-open", open);
  const menuButton = document.querySelector("#mobile-menu-toggle");
  const sidebar = document.querySelector("#sidebar");
  if (menuButton) menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  if (sidebar) sidebar.setAttribute("aria-hidden", open ? "false" : "true");
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
    <span class="status-dot"></span>
    <span id="api-status">Checking API...</span>
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

function setApiStatus(label) {
  const status = document.querySelector("#api-status");
  if (status) status.textContent = label;
}

window.addEventListener("sid-api-success", (event) => {
  setApiStatus("API Online");
  console.info("[API] success:", event.detail);
});

window.addEventListener("sid-api-failure", (event) => {
  setApiStatus("API Error");
  console.warn("[API] request failed:", event.detail);
});

async function checkApi() {
  setApiStatus("API Checking...");
  try {
    const data = await apiHealth();

    if (data?.status === "ok") {
      setApiStatus("API Online");
    } else {
      setApiStatus("API Response");
    }

    console.info("[API] health:", data);
  } catch (error) {
    setApiStatus("API Error");
    console.warn("[API] health check failed:", error);
  }
}

checkApi();
