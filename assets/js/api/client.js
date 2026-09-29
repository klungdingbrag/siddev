import { APP_CONFIG } from "../config.js";

function buildUrl(action, params = {}) {
  if (!APP_CONFIG.apiBaseUrl) {
    throw new Error("API_BASE_URL belum dikonfigurasi di assets/js/config.js");
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

export async function apiRequest(action, params = {}) {
  const url = buildUrl(action, params);

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      mode: "cors",
      redirect: "follow",
      cache: "no-store"
    });
  } catch (error) {
    throw new Error(
      `NETWORK/CORS: ${error?.message || "fetch gagal"} | URL: ${url}`
    );
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} saat memanggil API.`);
  }

  let result;

  try {
    result = await response.json();
  } catch (error) {
    throw new Error(
      `RESPONSE_JSON_ERROR: ${error?.message || "respons bukan JSON"}`
    );
  }

  if (!result.success) {
    throw new Error(
      result.error?.message ||
      result.message ||
      "API request gagal."
    );
  }

  return result.data;
}

export async function apiHealth() {
  return apiRequest("health");
}
