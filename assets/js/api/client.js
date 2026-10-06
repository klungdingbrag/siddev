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

async function fetchJson(url, timeoutMs = 12000) {
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
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();

  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }

  return { response, text, result };
}

export async function apiRequest(action, params = {}) {
  const url = buildUrl(action, params);
  let lastError = null;

  // GAS Content Service uses a redirect to script.googleusercontent.com.
  // Retry once for transient redirect/service failures without changing the backend.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { response, text, result } = await fetchJson(url);

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

      return result.data;
    } catch (error) {
      lastError = error;

      const message = error?.name === "AbortError"
        ? `timeout setelah 12 detik`
        : (error?.message || "Unknown error");

      // Network/CORS/timeout failures are retried once because GAS may redirect
      // through script.googleusercontent.com before returning JSON.
      if (
        attempt === 0 &&
        (
          error?.name === "AbortError" ||
          /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)
        )
      ) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
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
