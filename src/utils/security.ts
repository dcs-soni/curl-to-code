import path from "path";

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF).
 * Blocks RFC 1918 private networks, loopback, link-local, and broadcast addresses.
 */
export function validateUrl(
  urlString: string,
  allowPrivate: boolean = false,
): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(
      `Unsupported protocol: ${parsedUrl.protocol}. Only http and https are allowed.`,
    );
  }

  if (!allowPrivate && isPrivateOrLocal(parsedUrl.hostname)) {
    throw new Error(
      `URL resolves to a private or local network address, which is blocked for security reasons. Use the --allow-private flag if you explicitly need to allow this.`,
    );
  }

  return parsedUrl;
}

function isPrivateOrLocal(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "broadcasthost"
  ) {
    return true;
  }

  // Check for IPv4 addresses
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const parts = match.slice(1).map((p) => parseInt(p, 10));
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local - AWS metadata endpoints, etc)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 255.255.255.255 (Broadcast)
    if (
      parts[0] === 255 &&
      parts[1] === 255 &&
      parts[2] === 255 &&
      parts[3] === 255
    )
      return true;
  }

  // Check for basic IPv6 representations of loopback
  if (hostname === "[::1]" || hostname === "[0:0:0:0:0:0:0:1]") {
    return true;
  }

  return false;
}

// Validates that a target file path does not escape a base directory via path traversal.

export function validateSafePath(
  targetPath: string,
  baseDir: string = process.cwd(),
): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);

  if (
    !resolvedTarget.startsWith(resolvedBase + path.sep) &&
    resolvedTarget !== resolvedBase
  ) {
    throw new Error(
      "Path traversal detected: The provided output path resolves outside the current working directory.",
    );
  }

  return resolvedTarget;
}

export function sanitizeJson(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeJson);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    sanitized[key] = sanitizeJson(value);
  }

  return sanitized;
}

// Deep clones an object and masks the values of keys that appear to contain
// sensitive information (passwords, tokens, API keys, etc.).
export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Basic heuristic for strings that look like very long tokens
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const sensitiveRegex =
    /password|secret|token|api_?key|auth|credential|ssn|credit_?card|authorization/i;

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveRegex.test(key) && typeof value === "string") {
      redacted[key] = "[REDACTED]";
    } else if (sensitiveRegex.test(key) && typeof value === "number") {
      redacted[key] = 0; // Or whatever makes sense for numbers
    } else {
      redacted[key] = redactSensitiveData(value);
    }
  }

  return redacted;
}
