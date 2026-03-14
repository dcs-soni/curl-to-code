import React from "react";
import { render, Box, Text } from "ink";
import highlight from "cli-highlight";
import { GeneratedCode } from "../services/generator.js";

interface ResultViewerProps {
  json: any;
  generated: GeneratedCode;
}

const highlightCode = (code: string, lang: string) => {
  try {
    return highlight(code, { language: lang, ignoreIllegals: true });
  } catch {
    return code;
  }
};

const ResultViewer: React.FC<ResultViewerProps> = ({ json, generated }) => {
  const jsonStr = JSON.stringify(json, null, 2);
  // Optional: Cap the JSON string length if it's too massive to avoid terminal lag
  const displayJson =
    jsonStr.length > 2000
      ? jsonStr.slice(0, 2000) + "\n... (truncated)"
      : jsonStr;

  return (
    <Box flexDirection="column" gap={1} marginTop={1} marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        flexDirection="column"
        paddingX={1}
      >
        <Box marginBottom={1}>
          <Text bold color="cyan">
            📡 Raw JSON Payload (Excerpt)
          </Text>
        </Box>
        <Text>{highlightCode(displayJson, "json")}</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor="magenta"
        flexDirection="column"
        paddingX={1}
      >
        <Box marginBottom={1}>
          <Text bold color="magenta">
            ⚡ Generated TypeScript Interfaces
          </Text>
        </Box>
        <Text>{highlightCode(generated.typeScript, "typescript")}</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor="yellow"
        flexDirection="column"
        paddingX={1}
      >
        <Box marginBottom={1}>
          <Text bold color="yellow">
            🛡️ Generated Zod Schema
          </Text>
        </Box>
        <Text>
          {highlightCode(
            `import { z } from "zod";\n\n${generated.zod}`,
            "typescript",
          )}
        </Text>
      </Box>
    </Box>
  );
};

export const renderResult = (json: any, generated: GeneratedCode) => {
  // Ink to render the React component directly to stdout
  render(<ResultViewer json={json} generated={generated} />);
};
