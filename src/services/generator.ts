import JsonToTS from "json-to-ts";
import { jsonToZod } from "json-to-zod";

export interface GeneratedCode {
  typeScript: string;
  zod: string;
}

export function generateCode(json: any): GeneratedCode {
  let tsCode = "";
  try {
    const interfaces = JsonToTS(json);
    tsCode = interfaces.join("\n\n");
  } catch (error) {
    tsCode = "// Failed to generate TypeScript interfaces\n// " + String(error);
  }

  let zodCode = "";
  try {
    zodCode = jsonToZod(json);
  } catch (error) {
    zodCode = "// Failed to generate Zod schema\n// " + String(error);
  }

  return {
    typeScript: tsCode,
    zod: zodCode,
  };
}
