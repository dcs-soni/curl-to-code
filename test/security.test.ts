import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateUrlSync,
  validateUrl,
  validateSafePath,
  sanitizeJson,
  redactSensitiveData,
  redactHeaders,
  sanitizeErrorMessage,
} from "../src/utils/security.js";
import path from "path";

describe("Security Utilities", () => {
  // ─── SSRF Protection ────────────────────────────────────────────────
  describe("validateUrlSync (SSRF Protection)", () => {
    test("allows standard public URLs", () => {
      const url = validateUrlSync("https://api.github.com/users");
      assert.equal(url.hostname, "api.github.com");
    });

    test("blocks localhost", () => {
      assert.throws(
        () => validateUrlSync("http://localhost:8080"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks local IPv4 loopback", () => {
      assert.throws(
        () => validateUrlSync("http://127.0.0.1/admin"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks AWS metadata endpoint (Link-local)", () => {
      assert.throws(
        () => validateUrlSync("http://169.254.169.254/latest/meta-data/"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks private IPv4 networks (10.x.x.x)", () => {
      assert.throws(
        () => validateUrlSync("http://10.0.0.5/internal"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks private IPv4 networks (192.168.x.x)", () => {
      assert.throws(
        () => validateUrlSync("http://192.168.1.1/router"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks private IPv4 networks (172.16-31.x.x)", () => {
      assert.throws(
        () => validateUrlSync("http://172.16.0.1/internal"),
        /resolves to a private or local network address/,
      );
      assert.throws(
        () => validateUrlSync("http://172.31.255.255/internal"),
        /resolves to a private or local network address/,
      );
    });

    test("allows private networks if allowPrivate flag is true", () => {
      const url = validateUrlSync("http://localhost:8080", true);
      assert.equal(url.hostname, "localhost");
    });

    test("blocks unsupported protocols", () => {
      assert.throws(
        () => validateUrlSync("file:///etc/passwd"),
        /Unsupported protocol/,
      );
      assert.throws(
        () => validateUrlSync("ftp://example.com"),
        /Unsupported protocol/,
      );
    });

    test("blocks IPv6 loopback", () => {
      assert.throws(
        () => validateUrlSync("http://[::1]/admin"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks IPv6 unique-local (fc00::/7)", () => {
      assert.throws(
        () => validateUrlSync("http://[fd12:3456:789a::1]/internal"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks IPv6 link-local (fe80::/10)", () => {
      assert.throws(
        () => validateUrlSync("http://[fe80::1]/internal"),
        /resolves to a private or local network address/,
      );
    });
  });

  // ─── Async validateUrl (DNS Rebinding protection) ───────────────────
  describe("validateUrl (async with DNS check)", () => {
    test("allows standard public URLs", async () => {
      const url = await validateUrl("https://api.github.com/users");
      assert.equal(url.hostname, "api.github.com");
    });

    test("blocks localhost", async () => {
      await assert.rejects(
        () => validateUrl("http://localhost:8080"),
        /resolves to a private or local network address/,
      );
    });

    test("blocks private IPs", async () => {
      await assert.rejects(
        () => validateUrl("http://10.0.0.5/internal"),
        /resolves to a private or local network address/,
      );
    });
  });

  // ─── Path Traversal Protection ──────────────────────────────────────
  describe("validateSafePath (Path Traversal Protection)", () => {
    const baseDir = process.cwd();

    test("allows writing to a file in the current directory", () => {
      const safePath = validateSafePath("./output.ts", baseDir);
      assert.equal(safePath, path.join(baseDir, "output.ts"));
    });

    test("allows writing to a subdirectory", () => {
      const safePath = validateSafePath("./src/models/output.ts", baseDir);
      assert.equal(
        safePath,
        path.join(baseDir, "src", "models", "output.ts"),
      );
    });

    test("blocks writing outside the current directory via relative paths", () => {
      assert.throws(
        () => validateSafePath("../../../etc/passwd.ts", baseDir),
        /Path traversal detected/,
      );
      assert.throws(
        () => validateSafePath("../../windows/system32/cmd.ts", baseDir),
        /Path traversal detected/,
      );
    });

    test("blocks absolute paths outside the base directory", () => {
      const outsidePath = path.resolve(baseDir, "../../outside.ts");
      assert.throws(
        () => validateSafePath(outsidePath, baseDir),
        /Path traversal detected/,
      );
    });

    test("blocks disallowed file extensions", () => {
      assert.throws(
        () => validateSafePath("./output.sh", baseDir),
        /Unsupported output file extension/,
      );
      assert.throws(
        () => validateSafePath("./output.exe", baseDir),
        /Unsupported output file extension/,
      );
    });

    test("allows .ts, .tsx, .js, .json extensions", () => {
      assert.ok(validateSafePath("./out.ts", baseDir));
      assert.ok(validateSafePath("./out.tsx", baseDir));
      assert.ok(validateSafePath("./out.js", baseDir));
      assert.ok(validateSafePath("./out.json", baseDir));
    });
  });

  // ─── Prototype Pollution Protection ─────────────────────────────────
  describe("sanitizeJson (Prototype Pollution Protection)", () => {
    test("strips __proto__ and constructor keys", () => {
      const maliciousPayload = {
        name: "test",
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
      };

      const sanitized = sanitizeJson(maliciousPayload);

      assert.equal(sanitized.name, "test");
      // After sanitization, these keys should not exist as own properties
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized, "constructor"),
        false,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized, "__proto__"),
        false,
      );
    });

    test("handles nested objects and arrays correctly", () => {
      const payload = {
        users: [
          { name: "Alice", __proto__: { admin: true } },
          { name: "Bob", details: { age: 30, constructor: "evil" } },
        ],
      };

      const sanitized = sanitizeJson(payload);
      assert.equal(sanitized.users[0].name, "Alice");
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized.users[0], "__proto__"),
        false,
      );
      assert.equal(sanitized.users[1].details.age, 30);
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized.users[1].details, "constructor"),
        false,
      );
    });

    test("returns primitives and null unchanged", () => {
      assert.equal(sanitizeJson(null), null);
      assert.equal(sanitizeJson(42), 42);
      assert.equal(sanitizeJson("hello"), "hello");
      assert.equal(sanitizeJson(true), true);
    });
  });

  // ─── Header Redaction ───────────────────────────────────────────────
  describe("redactHeaders (Credential Leakage Prevention)", () => {
    test("redacts Authorization header with env var placeholder", () => {
      const headers = {
        Authorization: "Bearer sk_live_1234567890",
        "Content-Type": "application/json",
      };
      const safe = redactHeaders(headers);
      assert.match(safe["Authorization"], /process\.env/);
      assert.equal(safe["Content-Type"], "application/json");
    });

    test("redacts Cookie and X-Api-Key headers", () => {
      const headers = {
        Cookie: "session=abc123",
        "X-Api-Key": "my-secret-key",
        Accept: "application/json",
      };
      const safe = redactHeaders(headers);
      assert.match(safe["Cookie"], /process\.env/);
      assert.match(safe["X-Api-Key"], /process\.env/);
      assert.equal(safe["Accept"], "application/json");
    });
  });

  // ─── Terminal Data-Leakage Prevention ───────────────────────────────
  describe("redactSensitiveData (Terminal Data Leakage Prevention)", () => {
    test("redacts values of keys matching sensitive patterns", () => {
      const data = {
        id: 123,
        username: "johndoe",
        password: "supersecretpassword",
        api_key: "sk_live_1234567890",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        authorization: "Bearer ABCDEF",
      };

      const redacted = redactSensitiveData(data);

      assert.equal(redacted.id, 123);
      assert.equal(redacted.username, "johndoe");
      assert.equal(redacted.password, "[REDACTED]");
      assert.equal(redacted.api_key, "[REDACTED]");
      assert.equal(redacted.token, "[REDACTED]");
      assert.equal(redacted.authorization, "[REDACTED]");
    });

    test("recursively redacts nested data", () => {
      const data = {
        user: {
          profile: {
            name: "John",
            ssn: "123-45-678",
          },
          credentials: {
            secretKey: "my-secret-key",
          },
        },
      };

      const redacted = redactSensitiveData(data);

      assert.equal(redacted.user.profile.name, "John");
      assert.equal(redacted.user.profile.ssn, "[REDACTED]");
      assert.equal(redacted.user.credentials.secretKey, "[REDACTED]");
    });
  });

  // ─── Error Sanitization ─────────────────────────────────────────────
  describe("sanitizeErrorMessage", () => {
    test("strips file paths from error messages", () => {
      const err = new Error(
        "ENOENT: no such file or directory, open 'C:\\Users\\dev\\secret\\config.json'",
      );
      const msg = sanitizeErrorMessage(err);
      assert.ok(!msg.includes("C:\\Users"));
      assert.ok(msg.includes("[internal path]"));
    });

    test("handles non-Error values", () => {
      assert.equal(sanitizeErrorMessage("plain string"), "plain string");
      assert.equal(sanitizeErrorMessage(42), "42");
    });
  });
});
