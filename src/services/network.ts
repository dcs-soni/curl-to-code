import { RequestConfig } from "../utils/curl-parser.js";
import { validateUrl } from "../utils/security.js";

export async function fetchNetworkData(
  config: RequestConfig,
  options: { maxResponseSize?: number; allowPrivate?: boolean } = {}
): Promise<any> {
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

    const validatedUrl = validateUrl(config.url, options.allowPrivate);
    const response = await fetch(validatedUrl.toString(), init);
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

    const maxResponseSize = options.maxResponseSize || 10 * 1024 * 1024; // 10MB default

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxResponseSize) {
      throw new Error(`Response size exceeds maximum allowed limit (${maxResponseSize} bytes).`);
    }

    if (!response.body) {
      throw new Error("Response body is empty or not readable.");
    }

    const reader = response.body.getReader();
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        receivedLength += value.length;
        if (receivedLength > maxResponseSize) {
          throw new Error(`Response size exceeds maximum allowed limit (${maxResponseSize} bytes).`);
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
    const data = JSON.parse(text);
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
