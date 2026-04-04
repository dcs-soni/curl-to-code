# ⚡ curl-to-code

[![CI](https://github.com/YOUR_USERNAME/curl-to-code/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/curl-to-code/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A powerful CLI that instantly converts any **cURL command** (or API URL) into **TypeScript interfaces**, **Zod schemas**, and a **type-safe fetch client**.

Instead of manually typing out API interfaces and writing `fetch` boilerplate, you just paste the request from your browser's DevTools and let this tool do the rest.

---

## 🎯 Why is this useful?

- **Speeds up API Integration:** Turns a 10-minute task into a 5-second automated step.
- **Zero Credential Leakage:** Automatically swaps real tokens in your cURL command (`Authorization: Bearer my-token`, Cookies, API Keys) with safe `process.env.*` variables in the generated code.
- **Enterprise-Grade Security built-in:** Protects your machine with strict SSRF checks, DNS rebinding guards, and JSON prototype-pollution sanitization so it can't be weaponized via sketchy payloads.

---

## 🛠️ Setup

You need Node.js `v18.0.0` or higher.

To use the tool instantly (no persistent installation required):

```bash
npx curl-to-code
```

To install it globally on your machine:

```bash
npm install -g curl-to-code
```

---

## 🚀 How to Use it

Run `curl-to-code` to start the interactive prompt, or pass your command directly via flags.

### 1. Simple URL Fetch

```bash
npx curl-to-code --url "https://jsonplaceholder.typicode.com/posts/1"
```

### 2. Full cURL command (with headers/Auth)

```bash
npx curl-to-code --url 'curl https://api.github.com/users/octocat -H "Accept: application/json"'
```

### 3. Save output to a file directly

```bash
npx curl-to-code --url "https://api.github.com/events" --output ./src/api/events.ts
```

### Additional Flags

| Flag              | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `--output`, `-o`  | Output file path (e.g., `./models.ts`)                          |
| `--allow-private` | Opt-in to allow fetching from local networks (e.g. `localhost`) |
| `--timeout`, `-t` | Timeout for the request in seconds (default: 15)                |

---

## 💻 Example Output

If you provide a command to fetch a "Post" object, you get this formatted output:

```typescript
// 1. TypeScript Interfaces
interface ResponsePayload {
  id: number;
  title: string;
  body: string;
}

// 2. Zod Runtime Schema
import { z } from "zod";

export const ResponseSchema = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string(),
});

// 3. Type-Safe Fetch Client
export async function fetchData(): Promise<ResponsePayload> {
  const response = await fetch("...", { method: "GET" });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const data = await response.json();
  return ResponseSchema.parse(data);
}
```
