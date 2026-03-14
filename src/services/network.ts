import { RequestConfig } from "../utils/curl-parser.js";

export async function fetchNetworkData(config: RequestConfig): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const init: RequestInit = {
      method: config.method,
      headers: config.headers,
      signal: controller.signal,
    };

    if (config.body && ["POST", "PUT", "PATCH"].includes(config.method)) {
      init.body =
        typeof config.body === "string"
          ? config.body
          : JSON.stringify(config.body);
    }

    const response = await fetch(config.url, init);
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      throw new Error(
        `Failed to fetch: ${response.status} ${response.statusText}`,
      );
    }

    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(
        `Expected JSON response, but got ${contentType || "unknown"}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Network request timed out after 10 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
