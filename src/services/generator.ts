import JsonToTS from "json-to-ts";
import { jsonToZod } from "json-to-zod";
import type { RequestConfig } from "../utils/curl-parser.js";
import { redactHeaders } from "../utils/security.js";

export type ClientType = "fetch" | "axios" | "ky" | "got" | "ofetch";

export interface GeneratedCode {
  typeScript: string;
  zod: string;
  fetchClient: string;
}

export function generateCode(
  responseJson: any,
  config?: RequestConfig,
  clientType: ClientType = "fetch",
): GeneratedCode {
  const requestJson = config?.body;
  let tsCode = "";
  try {
    const resInterfaces = JsonToTS(responseJson, {
      rootName: "ResponsePayload",
    });
    tsCode = "// Response Interfaces\n" + resInterfaces.join("\n\n");

    if (requestJson && typeof requestJson === "object") {
      const reqInterfaces = JsonToTS(requestJson, {
        rootName: "RequestPayload",
      });
      tsCode += "\n\n// Request Interfaces\n" + reqInterfaces.join("\n\n");
    }
  } catch (error) {
    tsCode =
      "// Failed to generate TypeScript interfaces\n// " + String(error);
  }

  let zodCode = "";
  try {
    let resZod = jsonToZod(responseJson, "ResponseSchema");
    if (!resZod.includes("ResponseSchema")) {
      resZod = `export const ResponseSchema = ${resZod}`;
    }
    zodCode = "// Response Schema\n" + resZod;

    if (requestJson && typeof requestJson === "object") {
      let reqZod = jsonToZod(requestJson, "RequestSchema");
      if (!reqZod.includes("RequestSchema")) {
        reqZod = `export const RequestSchema = ${reqZod}`;
      }
      zodCode += "\n\n// Request Schema\n" + reqZod;
    }
  } catch (error) {
    zodCode = "// Failed to generate Zod schema\n// " + String(error);
  }

  let fetchClient = "";
  if (config) {
    const hasBody = !!requestJson && typeof requestJson === "object";
    const reqType = hasBody ? "RequestPayload" : "any";

    // Redact sensitive headers (Authorization, Cookie, API keys) so they
    // are never hardcoded in generated source files.
    const safeHeaders = redactHeaders(config.headers);

    const headersStr = Object.keys(safeHeaders).length
      ? `\n    headers: ${JSON.stringify(safeHeaders, null, 2).replace(/\n/g, "\n    ")},`
      : "";

    switch (clientType) {
      case "axios":
        fetchClient = `// Axios API Client
import axios from "axios";

export async function fetchData(${hasBody ? `payload: ${reqType}` : ""}): Promise<ResponsePayload> {
  const response = await axios({
    url: "${config.url}",
    method: "${config.method}",${headersStr}${hasBody ? `\n    data: payload,` : ""}
  });

  return ResponseSchema.parse(response.data);
}`;
        break;
      case "ky":
        fetchClient = `// Ky API Client
import ky from "ky";

export async function fetchData(${hasBody ? `payload: ${reqType}` : ""}): Promise<ResponsePayload> {
  const data = await ky("${config.url}", {
    method: "${config.method}",${headersStr}${hasBody ? `\n    json: payload,` : ""}
  }).json();

  return ResponseSchema.parse(data);
}`;
        break;
      case "got":
        fetchClient = `// Got API Client
import got from "got";

export async function fetchData(${hasBody ? `payload: ${reqType}` : ""}): Promise<ResponsePayload> {
  const data = await got("${config.url}", {
    method: "${config.method}",${headersStr}${hasBody ? `\n    json: payload,` : ""}
  }).json();

  return ResponseSchema.parse(data);
}`;
        break;
      case "ofetch":
        fetchClient = `// Ofetch API Client
import { ofetch } from "ofetch";

export async function fetchData(${hasBody ? `payload: ${reqType}` : ""}): Promise<ResponsePayload> {
  const data = await ofetch("${config.url}", {
    method: "${config.method}",${headersStr}${hasBody ? `\n    body: payload,` : ""}
  });

  return ResponseSchema.parse(data);
}`;
        break;
      case "fetch":
      default:
        fetchClient = `// Fetch API Client
export async function fetchData(${hasBody ? `payload: ${reqType}` : ""}): Promise<ResponsePayload> {
  const response = await fetch("${config.url}", {
    method: "${config.method}",${headersStr}${hasBody ? `\n    body: JSON.stringify(payload),` : ""}
  });

  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }

  const data = await response.json();
  return ResponseSchema.parse(data);
}`;
        break;
    }
  }

  return {
    typeScript: tsCode,
    zod: zodCode,
    fetchClient,
  };
}
