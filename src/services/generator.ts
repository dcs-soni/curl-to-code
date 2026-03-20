import JsonToTS from "json-to-ts";
import { jsonToZod } from "json-to-zod";
import type { RequestConfig } from "../utils/curl-parser.js";

export interface GeneratedCode {
  typeScript: string;
  zod: string;
  fetchClient: string;
}

export function generateCode(responseJson: any, config?: RequestConfig): GeneratedCode {
  const requestJson = config?.body;
  let tsCode = "";
  try {
    const resInterfaces = JsonToTS(responseJson, { rootName: "ResponsePayload" });
    tsCode = "// Response Interfaces\n" + resInterfaces.join("\n\n");

    if (requestJson) {
      const reqInterfaces = JsonToTS(requestJson, { rootName: "RequestPayload" });
      tsCode += "\n\n// Request Interfaces\n" + reqInterfaces.join("\n\n");
    }
  } catch (error) {
    tsCode = "// Failed to generate TypeScript interfaces\n// " + String(error);
  }

  let zodCode = "";
  try {
    // jsonToZod outputs something like `export const schema = z.object(...)` 
    // or just the zod object string depending on version. 
    let resZod = jsonToZod(responseJson, "ResponseSchema");
    if (!resZod.includes("ResponseSchema")) {
        resZod = `export const ResponseSchema = ${resZod}`;
    }
    zodCode = "// Response Schema\n" + resZod;

    if (requestJson) {
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
    const hasBody = !!requestJson;
    const reqType = hasBody ? "RequestPayload" : "any";
    
    const headersStr = Object.keys(config.headers).length 
      ? `\n    headers: ${JSON.stringify(config.headers, null, 2).replace(/\n/g, "\n    ")},` 
      : "";
    
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
  }

  return {
    typeScript: tsCode,
    zod: zodCode,
    fetchClient,
  };
}
