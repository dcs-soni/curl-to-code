import path from "path";
import dns from "dns/promises";

// ─── Sensitive header patterns (for generated code redaction) ───────────────
const SENSITIVE_HEADER_REGEX =
  /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization|www-authenticate)$/i;

// ─── Allowed output file extensions ─────────────────────────────────────────
const ALLOWED_OUTPUT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".cjs",
  ".d.ts",
]);

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF).
 *
 * Defence-in-depth:
 *  1. Parse and validate the URL structure (protocol allowlist).
 *  2. Check the hostname string against known private/local patterns.
 *  3. Resolve DNS and check the resolved IP against the blocklist to prevent
 *     DNS-rebinding attacks (e.g. localtest.me, nip.io).
 */
export async function validateUrl(
  urlString: string,
  allowPrivate: boolean = false,
): Promise<URL> {
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

  if (!allowPrivate) {
    // Step 1: Quick string-based check (catches obvious cases fast)
    if (isPrivateOrLocal(parsedUrl.hostname)) {
      throw new Error(
        `URL resolves to a private or local network address, which is blocked for security reasons. Use the --allow-private flag if you explicitly need to allow this.`,
      );
    }

    // Step 2: DNS resolution check (catches rebinding: e.g. 127.0.0.1.nip.io)
    await validateResolvedAddress(parsedUrl.hostname);
  }

  return parsedUrl;
}

/**
 * Synchronous URL validation for contexts where async is impractical.
 * NOTE: This does NOT protect against DNS rebinding.  Prefer validateUrl().
 */
export function validateUrlSync(
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

// ─── DNS rebinding protection ───────────────────────────────────────────────

async function validateResolvedAddress(hostname: string): Promise<void> {
  // If the hostname is already an IP literal, skip DNS
  if (isIpLiteral(hostname)) return;

  try {
    const addresses = await dns.resolve4(hostname);
    for (const ip of addresses) {
      if (isPrivateOrLocalIp(ip)) {
        throw new Error(
          `URL hostname '${hostname}' resolves to a private/local IP address (${ip}), which is blocked for security reasons.`,
        );
      }
    }
  } catch (error: any) {
    // Re-throw our own errors
    if (error.message.includes("blocked for security")) throw error;
    // DNS resolution failure — let fetch handle it (ENOTFOUND, etc.)
  }

  // Also check IPv6
  try {
    const addresses = await dns.resolve6(hostname);
    for (const ip of addresses) {
      if (isPrivateOrLocalIpv6(ip)) {
        throw new Error(
          `URL hostname '${hostname}' resolves to a private/local IPv6 address (${ip}), which is blocked for security reasons.`,
        );
      }
    }
  } catch (error: any) {
    if (error.message.includes("blocked for security")) throw error;
    // No AAAA record is fine
  }
}

function isIpLiteral(hostname: string): boolean {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  // IPv6 bracket notation
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  return false;
}

// ─── Private/Local IP checkers ──────────────────────────────────────────────

function isPrivateOrLocal(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "broadcasthost"
  ) {
    return true;
  }

  // Strip IPv6 brackets for consistent checking
  const cleanHost = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  // Check for IPv4 addresses
  if (isPrivateOrLocalIp(cleanHost)) return true;

  // Check for IPv6 addresses
  if (isPrivateOrLocalIpv6(cleanHost)) return true;

  return false;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);
  if (!match) return false;

  const parts = match.slice(1).map((p) => parseInt(p, 10));

  // Validate each octet is 0-255
  if (parts.some((p) => p < 0 || p > 255)) return false;

  // 0.0.0.0/8
  if (parts[0] === 0) return true;
  // 10.0.0.0/8 (Private)
  if (parts[0] === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (Link-local – AWS/GCP metadata endpoints)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 172.16.0.0/12 (Private)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  // 255.255.255.255 (Broadcast)
  if (parts.every((p) => p === 255)) return true;

  return false;
}

function isPrivateOrLocalIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // Loopback
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  // Unspecified
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

  // Unique local (fc00::/7 → fc__ or fd__)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // Link-local (fe80::/10)
  if (normalized.startsWith("fe80")) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4MappedMatch = normalized.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/,
  );
  if (v4MappedMatch && isPrivateOrLocalIp(v4MappedMatch[1])) return true;

  // IPv4-mapped compact form (::ffff:7f00:1 = 127.0.0.1)
  const v4CompactMatch = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4CompactMatch) {
    const high = parseInt(v4CompactMatch[1], 16);
    const low = parseInt(v4CompactMatch[2], 16);
    const reconstructed = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
    if (isPrivateOrLocalIp(reconstructed)) return true;
  }

  return false;
}

// ─── Path traversal protection ──────────────────────────────────────────────

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

  // Validate file extension
  const ext = path.extname(resolvedTarget).toLowerCase();
  // Allow compound extensions like .d.ts
  const basename = path.basename(resolvedTarget).toLowerCase();
  const isAllowed =
    ALLOWED_OUTPUT_EXTENSIONS.has(ext) || basename.endsWith(".d.ts");

  if (!isAllowed) {
    throw new Error(
      `Unsupported output file extension '${ext}'. Allowed extensions: ${[...ALLOWED_OUTPUT_EXTENSIONS].join(", ")}`,
    );
  }

  return resolvedTarget;
}

// ─── Prototype pollution protection ─────────────────────────────────────────

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

// ─── Header redaction for generated code ────────────────────────────────────

/**
 * Returns a copy of the headers with sensitive values replaced by
 * environment-variable placeholders suitable for generated source code.
 */
export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_REGEX.test(key)) {
      // Generate an env-var name from the header key
      const envVar = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      safe[key] = `\${process.env.${envVar} ?? ""}`;
    } else {
      safe[key] = value;
    }
  }

  return safe;
}

// ─── Terminal data-leakage prevention ───────────────────────────────────────

/**
 * Deep clones an object and masks the values of keys that appear to contain
 * sensitive information (passwords, tokens, API keys, etc.).
 */
export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
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
      redacted[key] = 0;
    } else {
      redacted[key] = redactSensitiveData(value);
    }
  }

  return redacted;
}

// ─── Error sanitization ─────────────────────────────────────────────────────

/**
 * Wraps raw error messages to strip internal file paths and stack traces
 * so they are safe to present to end-users.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Strip absolute file paths from the message
    return error.message.replace(
      /([A-Z]:)?[\/\\][\w\/\\.\-@]+/gi,
      "[internal path]",
    );
  }
  return String(error);
}
