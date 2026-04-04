import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurlOrUrl } from "../src/utils/curl-parser.js";

test("parses a simple https URL", async () => {
  const config = await parseCurlOrUrl("https://api.github.com/users/octocat");
  // URL constructor normalises by appending a trailing slash to bare origins
  assert.equal(config.url, "https://api.github.com/users/octocat");
  assert.equal(config.method, "GET");
  assert.deepEqual(config.headers, {});
  assert.equal(config.body, undefined);
});

test("parses a basic curl GET command", async () => {
  const config = await parseCurlOrUrl(
    "curl https://api.github.com/users/octocat",
  );
  assert.equal(config.url, "https://api.github.com/users/octocat");
  assert.equal(config.method, "GET");
});

test("parses a curl command with headers", async () => {
  const config = await parseCurlOrUrl(
    'curl -H "Authorization: Bearer 123" -H "Accept: application/json" https://api.example.com',
  );
  // Note: URL.toString() appends trailing slash to bare origins
  assert.equal(config.url, "https://api.example.com/");
  assert.equal(config.headers["Authorization"], "Bearer 123");
  assert.equal(config.headers["Accept"], "application/json");
});

test("parses a curl POST command with JSON body", async () => {
  const config = await parseCurlOrUrl(
    `curl -X POST https://api.example.com/data -H "Content-Type: application/json" -d '{"name": "test", "value": 42}'`,
  );
  assert.equal(config.url, "https://api.example.com/data");
  assert.equal(config.method, "POST");
  assert.deepEqual(config.body, { name: "test", value: 42 });
  assert.equal(config.dataFormat, "json");
});

test("throws error on invalid input", async () => {
  await assert.rejects(
    () => parseCurlOrUrl("not a url or curl"),
    /Input must be a valid URL starting with http\/https or a `curl` command/,
  );
});

test("rejects inputs exceeding max length", async () => {
  const longInput = "https://example.com/" + "a".repeat(100_001);
  await assert.rejects(
    () => parseCurlOrUrl(longInput),
    /exceeds maximum allowed length/,
  );
});

test("defaults to POST when -d is used without -X", async () => {
  const config = await parseCurlOrUrl(
    `curl https://api.example.com/data -d '{"key":"val"}'`,
  );
  assert.equal(config.method, "POST");
});

test("preserves explicit method even when -d is used", async () => {
  const config = await parseCurlOrUrl(
    `curl -X PUT https://api.example.com/data -d '{"key":"val"}'`,
  );
  assert.equal(config.method, "PUT");
});
