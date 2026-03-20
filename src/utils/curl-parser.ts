import yargsParser from "yargs-parser";
import { validateUrl, sanitizeJson } from "./security.js";

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

export function parseCurlOrUrl(input: string, options: { allowPrivate?: boolean } = {}): RequestConfig {
  if (input.length > 100000) {
    throw new Error("Input payload exceeds maximum allowed length (100KB).");
  }

  const trimmed = input.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsedUrl = validateUrl(trimmed, options.allowPrivate);
      return {
        url: parsedUrl.toString(),
        method: "GET",
        headers: {},
      };
    } catch (error: any) {
      throw new Error(error.message || "Provided input looks like a URL but is invalid.");
    }
  }

  if (trimmed.startsWith("curl ")) {
    // Basic regex to split by spaces, respecting quotes, to pass to yargs
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

    const parsed = yargsParser(args.slice(1), {
      alias: {
        request: ["X"],
        header: ["H"],
        data: ["d", "data-raw", "data-urlencode", "data-binary"],
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
    
    // Will throw if SSRF or invalid
    const validatedUrl = validateUrl(url, options.allowPrivate);

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

    let body: any = undefined;
    if (parsed.data) {
      // If there's data, default POST
      if (!parsed.request) {
        method = "POST";
      }
      try {
        body = sanitizeJson(JSON.parse(parsed.data as string));
      } catch {
        // Not JSON, just pass as string
        body = parsed.data;
      }
    }

    return {
      url: validatedUrl.toString(),
      method: method.toUpperCase(),
      headers,
      body,
    };
  }

  throw new Error(
    "Input must be a valid URL starting with http/https or a `curl` command.",
  );
}
