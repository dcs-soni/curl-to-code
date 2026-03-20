import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  validateUrl, 
  validateSafePath, 
  sanitizeJson, 
  redactSensitiveData 
} from '../src/utils/security.js';
import path from 'path';

describe('Security Utilities', () => {

  describe('validateUrl (SSRF Protection)', () => {
    test('allows standard public URLs', () => {
      const url = validateUrl('https://api.github.com/users');
      assert.equal(url.hostname, 'api.github.com');
    });

    test('blocks localhost', () => {
      assert.throws(() => validateUrl('http://localhost:8080'), /resolves to a private or local network address/);
    });

    test('blocks local IPv4 loopback', () => {
      assert.throws(() => validateUrl('http://127.0.0.1/admin'), /resolves to a private or local network address/);
    });

    test('blocks AWS metadata endpoint (Link-local)', () => {
      assert.throws(() => validateUrl('http://169.254.169.254/latest/meta-data/'), /resolves to a private or local network address/);
    });

    test('blocks private IPv4 networks (10.x.x.x)', () => {
      assert.throws(() => validateUrl('http://10.0.0.5/internal'), /resolves to a private or local network address/);
    });
    
    test('blocks private IPv4 networks (192.168.x.x)', () => {
      assert.throws(() => validateUrl('http://192.168.1.1/router'), /resolves to a private or local network address/);
    });

    test('allows private networks if allowPrivate flag is true', () => {
      const url = validateUrl('http://localhost:8080', true);
      assert.equal(url.hostname, 'localhost');
    });

    test('blocks unsupported protocols', () => {
      assert.throws(() => validateUrl('file:///etc/passwd'), /Unsupported protocol/);
      assert.throws(() => validateUrl('ftp://example.com'), /Unsupported protocol/);
    });
  });

  describe('validateSafePath (Path Traversal Protection)', () => {
    const baseDir = process.cwd();

    test('allows writing to a file in the current directory', () => {
      const safePath = validateSafePath('./output.ts', baseDir);
      assert.equal(safePath, path.join(baseDir, 'output.ts'));
    });

    test('allows writing to a subdirectory', () => {
      const safePath = validateSafePath('./src/models/output.ts', baseDir);
      assert.equal(safePath, path.join(baseDir, 'src', 'models', 'output.ts'));
    });

    test('blocks writing outside the current directory via relative paths', () => {
      assert.throws(() => validateSafePath('../../../etc/passwd', baseDir), /Path traversal detected/);
      assert.throws(() => validateSafePath('../../windows/system32/cmd.exe', baseDir), /Path traversal detected/);
    });

    test('blocks absolute paths outside the base directory', () => {
      const outsidePath = path.resolve(baseDir, '../../outside.txt');
      assert.throws(() => validateSafePath(outsidePath, baseDir), /Path traversal detected/);
    });
  });

  describe('sanitizeJson (Prototype Pollution Protection)', () => {
    test('strips __proto__ and constructor keys', () => {
      const maliciousPayload = {
        name: "test",
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } }
      };

      const sanitized = sanitizeJson(maliciousPayload);
      
      assert.equal(sanitized.name, "test");
      assert.equal(sanitized.__proto__, undefined); // Normal object behavior
      assert.equal(sanitized.constructor, undefined);
    });

    test('handles nested objects and arrays correctly', () => {
      const payload = {
        users: [
          { name: "Alice", __proto__: { admin: true } },
          { name: "Bob", details: { age: 30, constructor: "evil" } }
        ]
      };

      const sanitized = sanitizeJson(payload);
      assert.equal(sanitized.users[0].name, "Alice");
      assert.equal(sanitized.users[0].__proto__, undefined);
      assert.equal(sanitized.users[1].details.age, 30);
      assert.equal(sanitized.users[1].details.constructor, undefined);
    });
  });

  describe('redactSensitiveData (Terminal Data Leakage Prevention)', () => {
    test('redacts values of keys matching sensitive patterns', () => {
      const data = {
        id: 123,
        username: "johndoe",
        password: "supersecretpassword",
        api_key: "sk_live_1234567890",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        authorization: "Bearer ABCDEF"
      };

      const redacted = redactSensitiveData(data);
      
      assert.equal(redacted.id, 123);
      assert.equal(redacted.username, "johndoe");
      assert.equal(redacted.password, "[REDACTED]");
      assert.equal(redacted.api_key, "[REDACTED]");
      assert.equal(redacted.token, "[REDACTED]");
      assert.equal(redacted.authorization, "[REDACTED]");
    });

    test('recursively redacts nested data', () => {
      const data = {
        user: {
          profile: {
            name: "John",
            ssn: "123-45-678"
          },
          credentials: {
            secretKey: "my-secret-key"
          }
        }
      };

      const redacted = redactSensitiveData(data);
      
      assert.equal(redacted.user.profile.name, "John");
      assert.equal(redacted.user.profile.ssn, "[REDACTED]");
      assert.equal(redacted.user.credentials.secretKey, "[REDACTED]");
    });
  });

});
