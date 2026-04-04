import yargsParser from "yargs-parser";
import { validateUrl, validateUrlSync, sanitizeJson } from "./security.js";

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  /** Original data format flag from curl (e.g. "json", "urlencode", "binary", "raw") */
  dataFormat?: "json" | "urlencode" | "binary" | "raw" | "string";
}

/**
 * Parses a raw URL string or a full cURL command into a structured RequestConfig.
 *
 * Uses async URL validation (with DNS rebinding protection) by default.
 * Falls back to sync validation for pure URL inputs when `asyncValidation` is false.
 */
export async function parseCurlOrUrl(
  input: string,
  options: { allowPrivate?: boolean } = {},
): Promise<RequestConfig> {
  if (input.length > 100_000) {
    throw new Error("Input payload exceeds maximum allowed length (100KB).");
  }

  const trimmed = input.trim();

  // ─── Plain URL ──────────────────────────────────────────────────────
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsedUrl = await validateUrl(trimmed, options.allowPrivate);
      return {
        url: parsedUrl.toString(),
        method: "GET",
        headers: {},
      };
    } catch (error: any) {
      throw new Error(
        error.message || "Provided input looks like a URL but is invalid.",
      );
    }
  }

  // ─── cURL command ───────────────────────────────────────────────────
  if (trimmed.startsWith("curl ")) {
    return parseCurlCommand(trimmed, options);
  }

  throw new Error(
    "Input must be a valid URL starting with http/https or a `curl` command.",
  );
}

async function parseCurlCommand(
  trimmed: string,
  options: { allowPrivate?: boolean },
): Promise<RequestConfig> {
  // Tokenize respecting quoted strings
  const matchArgsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const matches = trimmed.match(matchArgsRegex) || [];

  const args = matches.map((m) => {
    if (
      (m.startsWith('"') && m.endsWith('"')) ||
      (m.startsWith("'") && m.endsWith("'"))
    ) {
      return m.slice(1, -1);
    }
    return m;
  });

  // Separate the data flags so we can detect format
  const parsed = yargsParser(args.slice(1), {
    alias: {
      request: ["X"],
      header: ["H"],
      data: ["d"],
      "data-raw": [],
      "data-urlencode": [],
      "data-binary": [],
    },
    configuration: {
      "parse-positional-numbers": false,
    },
  });

  // Extract URL (usually the first positional argument)
  let url = parsed._[0] as string;

  if (!url) {
    throw new Error("Could not find a valid URL in the cURL command.");
  }

  if (url.startsWith("'") || url.startsWith('"')) {
    url = url.slice(1, -1);
  }

  // Async DNS-aware validation
  const validatedUrl = await validateUrl(url, options.allowPrivate);

  let method = (parsed.request as string) || "GET";
  const headers: Record<string, string> = {};

  if (parsed.header) {
    const headerList = Array.isArray(parsed.header)
      ? parsed.header
      : [parsed.header];
    for (const h of headerList) {
      const [key, ...valueParts] = h.split(":");
      if (key && valueParts.length > 0) {
        headers[key.trim()] = valueParts.join(":").trim();
      }
    }
  }

  // ─── Body parsing with format awareness ───────────────────────────
  let body: any = undefined;
  let dataFormat: RequestConfig["dataFormat"] = undefined;

  // Check each data flag variant separately
  const rawData =
    parsed.data ?? parsed["data-raw"] ?? parsed["data-urlencode"] ?? parsed["data-binary"];

  if (rawData != null) {
    // Determine which flag was used for format tagging
    if (parsed["data-urlencode"] != null) {
      dataFormat = "urlencode";
      body = String(rawData);
    } else if (parsed["data-binary"] != null) {
      dataFormat = "binary";
      body = String(rawData);
    } else if (parsed["data-raw"] != null) {
      dataFormat = "raw";
      body = String(rawData);
    } else {
      // -d / --data — try JSON first
      try {
        body = sanitizeJson(JSON.parse(rawData as string));
        dataFormat = "json";
      } catch {
        body = rawData;
        dataFormat = "string";
      }
    }

    // Default to POST when data is present and no explicit method
    if (!parsed.request) {
      method = "POST";
    }
  }

  return {
    url: validatedUrl.toString(),
    method: method.toUpperCase(),
    headers,
    body,
    dataFormat,
  };
}
