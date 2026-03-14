import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurlOrUrl } from '../src/utils/curl-parser.js';

test('parses a simple https URL', () => {
  const config = parseCurlOrUrl('https://api.github.com/users/octocat');
  assert.equal(config.url, 'https://api.github.com/users/octocat');
  assert.equal(config.method, 'GET');
  assert.deepEqual(config.headers, {});
  assert.equal(config.body, undefined);
});

test('parses a basic curl GET command', () => {
  const config = parseCurlOrUrl('curl https://api.github.com/users/octocat');
  assert.equal(config.url, 'https://api.github.com/users/octocat');
  assert.equal(config.method, 'GET');
});

test('parses a curl command with headers', () => {
  const config = parseCurlOrUrl('curl -H "Authorization: Bearer 123" -H "Accept: application/json" https://api.example.com');
  assert.equal(config.url, 'https://api.example.com');
  assert.equal(config.headers['Authorization'], 'Bearer 123');
  assert.equal(config.headers['Accept'], 'application/json');
});

test('parses a curl POST command with JSON body', () => {
  const config = parseCurlOrUrl(`curl -X POST https://api.example.com/data -H "Content-Type: application/json" -d '{"name": "test", "value": 42}'`);
  assert.equal(config.url, 'https://api.example.com/data');
  assert.equal(config.method, 'POST');
  assert.deepEqual(config.body, { name: "test", value: 42 });
});

test('throws error on invalid input', () => {
  assert.throws(() => {
    parseCurlOrUrl('not a url or curl');
  }, /Input must be a valid URL starting with http\/https or a `curl` command/);
});
