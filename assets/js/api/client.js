import { APP_CONFIG } from "../config.js";

function buildUrl(action, params = {}) {
  if (!APP_CONFIG.apiBaseUrl) {
    throw new Error("API_BASE_URL belum dikonfigurasi di assets/js/config.js");
  }

  if (!action) {
    throw new Error("Action API wajib diisi.");
  }

  const url = new URL(APP_CONFIG.apiBaseUrl);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function fetchJson(url, timeoutMs, diagnostic = null) {
  const fetchStart = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });

    if (diagnostic) {
      diagnostic.fetchMs = Math.round(performance.now() - fetchStart);
      console.info("[SID API Diagnostic] FETCH RESPONSE", {
        action: diagnostic.action,
        ms: diagnostic.fetchMs,
        http: response.status
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  const textStart = performance.now();
  const text = await response.text();

  if (diagnostic) {
    diagnostic.textMs = Math.round(performance.now() - textStart);
    console.info("[SID API Diagnostic] RESPONSE TEXT", {
      action: diagnostic.action,
      ms: diagnostic.textMs,
      bytes: text.length
    });
  }

  const parseStart = performance.now();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }

  if (diagnostic) {
    diagnostic.parseMs = Math.round(performance.now() - parseStart);
    diagnostic.totalMs = Math.round(performance.now() - fetchStart);
    console.info("[SID API Diagnostic] JSON PARSE / FETCH TOTAL", {
      action: diagnostic.action,
      parseMs: diagnostic.parseMs,
      totalMs: diagnostic.totalMs
    });
  }

  return { response, text, result };
}

const API_TIMEOUTS = Object.freeze({
  health: 12000,
  piutang: 45000,
  customerPiutangDetail: 30000,
  tabungan: 30000,
  dashboardSalesDaily: 30000,
  dashboardProfitMonthly: 30000,
  dashboardSummary: 30000,
  pdfRingkasanPiutang: 60000,
  pdfSemuaDetailPiutang6D1: 60000,
  pdfSemuaDetailPiutang6D2: 180000,
  pdfCustomerStatementV1: 60000,
  pdfInvoice: 60000
});

const DEFAULT_API_TIMEOUT = 30000;

function getApiTimeout(action) {
  return API_TIMEOUTS[action] || DEFAULT_API_TIMEOUT;
}

export async function apiRequest(action, params = {}) {
  const url = buildUrl(action, params);
  let lastError = null;

  // GAS Content Service uses a redirect to script.googleusercontent.com.
  // Retry once for transient redirect/service failures without changing the backend.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const diagnostic = {
        action,
        requestId: action + "-" + Date.now()
      };

      console.info("[SID API Diagnostic] REQUEST START", {
        action,
        requestId: diagnostic.requestId
      });

      const { response, text, result } = await fetchJson(
        url,
        getApiTimeout(action),
        diagnostic
      );

      if (!response.ok) {
        const finalUrl = response.url || url;
        const retryable = [404, 502, 503, 504].includes(response.status);

        lastError = new Error(
          `HTTP ${response.status} saat memanggil API ${action}. URL akhir: ${finalUrl}` +
          (text ? ` | Respons: ${text.slice(0, 240)}` : "")
        );

        if (retryable && attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 250));
          continue;
        }

        throw lastError;
      }

      if (!result || typeof result !== "object") {
        throw new Error(
          `RESPONSE_JSON_ERROR: respons API bukan JSON valid untuk action "${action}".` +
          (text ? ` | Respons: ${text.slice(0, 240)}` : "")
        );
      }

      if (!result.success) {
        const backendError =
          typeof result.error === "string"
            ? result.error
            : result.error?.message || result.message;

        throw new Error(
          backendError ||
          `API request "${action}" gagal.`
        );
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sid-api-success", {
          detail: { action }
        }));
      }

      return result.data;
    } catch (error) {
      lastError = error;

      const message = error?.name === "AbortError"
        ? `timeout setelah ${getApiTimeout(action) / 1000} detik`
        : (error?.message || "Unknown error");

      // Retry transient network failures, but do not retry a timeout.
      // A timed-out Piutang request can be expensive on the backend, so retrying
      // it immediately would duplicate the same heavy operation.
      if (
        attempt === 0 &&
        error?.name !== "AbortError" &&
        /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)
      ) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sid-api-failure", {
          detail: { action, message }
        }));
      }

      throw new Error(
        `API "${action}" gagal: ${message}`
      );
    }
  }

  throw lastError || new Error(`API "${action}" gagal.`);
}

export async function apiHealth() {
  return apiRequest("health");
}
