import { RequestConfig } from "../utils/curl-parser.js";
import { validateUrl, sanitizeJson } from "../utils/security.js";

export interface FetchOptions {
  /** Maximum response size in bytes (default: 10 MB) */
  maxResponseSize?: number;
  /** Allow requests to private/local network addresses */
  allowPrivate?: boolean;
  /** Request timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
}

export async function fetchNetworkData(
  config: RequestConfig,
  options: FetchOptions = {},
): Promise<any> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxResponseSize = options.maxResponseSize ?? 10 * 1024 * 1024; // 10 MB

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

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

    const validatedUrl = await validateUrl(config.url, options.allowPrivate);
    const response = await fetch(validatedUrl.toString(), init);

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status} (${response.statusText}).`,
      );
    }

    const contentType = response.headers.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(
        `Expected a JSON response (application/json), but received: ${contentType || "unknown"}.`,
      );
    }

    // ─── Size guard: fast bail via Content-Length header ──────────────
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxResponseSize) {
      throw new Error(
        `Response size (${contentLength} bytes) exceeds the maximum allowed limit of ${maxResponseSize} bytes.`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is empty or not readable.");
    }

    // ─── Streaming body read with size enforcement ───────────────────
    const reader = response.body.getReader();
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        receivedLength += value.length;
        if (receivedLength > maxResponseSize) {
          reader.cancel();
          throw new Error(
            `Response size exceeds the maximum allowed limit of ${maxResponseSize} bytes.`,
          );
        }
        chunks.push(value);
      }
    }

    const chunksAll = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      chunksAll.set(chunk, position);
      position += chunk.length;
    }

    const text = new TextDecoder("utf-8").decode(chunksAll);
    const rawData = JSON.parse(text);

    // Sanitize to prevent prototype pollution from malicious API responses
    return sanitizeJson(rawData);
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(
        `Network request timed out after ${timeoutMs / 1000} seconds.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
