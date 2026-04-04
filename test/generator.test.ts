import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateCode } from "../src/services/generator.js";
import type { RequestConfig } from "../src/utils/curl-parser.js";

describe("Generator Service", () => {
  const sampleResponse = {
    userId: 1,
    id: 1,
    title: "Test Post",
    body: "This is the body",
  };

  describe("TypeScript interface generation", () => {
    test("generates ResponsePayload interface from JSON", () => {
      const result = generateCode(sampleResponse);
      assert.ok(result.typeScript.includes("ResponsePayload"));
      assert.ok(result.typeScript.includes("userId"));
      assert.ok(result.typeScript.includes("number"));
      assert.ok(result.typeScript.includes("string"));
    });

    test("generates RequestPayload interface when body is present", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "POST",
        headers: {},
        body: { name: "test", value: 42 },
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(result.typeScript.includes("RequestPayload"));
      assert.ok(result.typeScript.includes("name"));
    });

    test("does not generate RequestPayload when body is absent", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "GET",
        headers: {},
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(!result.typeScript.includes("RequestPayload"));
    });

    test("handles generation errors gracefully", () => {
      // Circular references or invalid input
      const result = generateCode(undefined as any);
      assert.ok(
        result.typeScript.includes("Failed") ||
          result.typeScript.includes("ResponsePayload"),
      );
    });
  });

  describe("Zod schema generation", () => {
    test("generates ResponseSchema from JSON", () => {
      const result = generateCode(sampleResponse);
      assert.ok(result.zod.includes("ResponseSchema"));
      assert.ok(result.zod.includes("z.object") || result.zod.includes("z."));
    });

    test("generates RequestSchema when body is present", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "POST",
        headers: {},
        body: { name: "test" },
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(result.zod.includes("RequestSchema"));
    });
  });

  describe("Fetch client generation", () => {
    test("generates fetch client with correct URL and method", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "GET",
        headers: {},
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(result.fetchClient.includes("https://api.example.com/data"));
      assert.ok(result.fetchClient.includes('"GET"'));
      assert.ok(result.fetchClient.includes("fetchData"));
    });

    test("includes body parameter for POST requests", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { name: "test" },
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(result.fetchClient.includes("payload: RequestPayload"));
      assert.ok(result.fetchClient.includes("JSON.stringify(payload)"));
    });

    test("does not include body parameter for GET requests", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "GET",
        headers: {},
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(!result.fetchClient.includes("payload"));
    });

    test("empty fetchClient when no config provided", () => {
      const result = generateCode(sampleResponse);
      assert.equal(result.fetchClient, "");
    });

    test("SECURITY: redacts Authorization headers in generated code", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "GET",
        headers: {
          Authorization: "Bearer sk_live_supersecret",
          "Content-Type": "application/json",
        },
      };
      const result = generateCode(sampleResponse, config);
      // Must NOT contain the actual token
      assert.ok(!result.fetchClient.includes("sk_live_supersecret"));
      // Must contain env var placeholder
      assert.ok(result.fetchClient.includes("process.env"));
      // Non-sensitive headers should be preserved
      assert.ok(result.fetchClient.includes("application/json"));
    });

    test("SECURITY: redacts Cookie and X-Api-Key headers", () => {
      const config: RequestConfig = {
        url: "https://api.example.com/data",
        method: "GET",
        headers: {
          Cookie: "session=abc123; token=xyz",
          "X-Api-Key": "my-secret-api-key",
          Accept: "application/json",
        },
      };
      const result = generateCode(sampleResponse, config);
      assert.ok(!result.fetchClient.includes("abc123"));
      assert.ok(!result.fetchClient.includes("my-secret-api-key"));
      assert.ok(result.fetchClient.includes("application/json"));
    });

    test("generates axios client", () => {
      const config: RequestConfig = { url: "https://api.example.com", method: "GET", headers: {} };
      const result = generateCode(sampleResponse, config, "axios");
      assert.ok(result.fetchClient.includes("import axios from \"axios\""));
      assert.ok(result.fetchClient.includes("await axios({"));
      assert.ok(result.fetchClient.includes("url: \"https://api.example.com\""));
    });

    test("generates ky client", () => {
      const config: RequestConfig = { url: "https://api.example.com", method: "POST", headers: {}, body: { a: 1 } };
      const result = generateCode(sampleResponse, config, "ky");
      assert.ok(result.fetchClient.includes("import ky from \"ky\""));
      assert.ok(result.fetchClient.includes("await ky(\"https://api.example.com\""));
      assert.ok(result.fetchClient.includes("json: payload"));
    });

    test("generates got client", () => {
      const config: RequestConfig = { url: "https://api.example.com", method: "GET", headers: {} };
      const result = generateCode(sampleResponse, config, "got");
      assert.ok(result.fetchClient.includes("import got from \"got\""));
      assert.ok(result.fetchClient.includes("await got(\"https://api.example.com\""));
    });

    test("generates ofetch client", () => {
      const config: RequestConfig = { url: "https://api.example.com", method: "POST", headers: {}, body: { a: 1 } };
      const result = generateCode(sampleResponse, config, "ofetch");
      assert.ok(result.fetchClient.includes("import { ofetch } from \"ofetch\""));
      assert.ok(result.fetchClient.includes("await ofetch(\"https://api.example.com\""));
      assert.ok(result.fetchClient.includes("body: payload"));
    });
  });

  describe("Edge cases", () => {
    test("handles nested JSON responses", () => {
      const nested = {
        data: {
          users: [
            { id: 1, name: "Alice", metadata: { role: "admin" } },
          ],
        },
        meta: { total: 100, page: 1 },
      };
      const result = generateCode(nested);
      assert.ok(result.typeScript.includes("ResponsePayload"));
      assert.ok(result.zod.includes("ResponseSchema"));
    });

    test("handles empty object response", () => {
      const result = generateCode({});
      assert.ok(result.typeScript.includes("ResponsePayload"));
      assert.ok(result.zod.includes("ResponseSchema"));
    });

    test("handles array response", () => {
      const result = generateCode([{ id: 1 }, { id: 2 }]);
      // Should still produce valid output
      assert.ok(result.typeScript.length > 0);
      assert.ok(result.zod.length > 0);
    });
  });
});
